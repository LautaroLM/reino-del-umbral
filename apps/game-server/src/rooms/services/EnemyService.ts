import { Client } from '@colyseus/core';
import { ServerMessage } from '@ao/shared-protocol';
import {
  ATTACK_RANGE,
  ATTACK_COOLDOWN_MS,
  RESPAWN_TIME_MS,
  XP_PER_LEVEL,
  HP_PER_LEVEL,
  BASE_PLAYER_DAMAGE,
  ENEMY_TEMPLATES,
  MAX_ENEMIES,
  SAFE_ZONE_MAX_X,
  SAFE_SPAWN_X,
  SAFE_SPAWN_Y,
  ITEM_DEFINITIONS,
  ENEMY_LOOT_TABLES,
  type EnemyTemplate,
} from '@ao/shared-constants';
import { AO_MAP_SIZE } from '@ao/shared-world';

import { EnemyState, type GameRoomState, type PlayerState } from '../GameRoomState.js';
import * as InventoryRepository from '../../db/InventoryRepository.js';
import type { QuestService } from './QuestService.js';

interface AttackData {
  targetId: string;
}

export interface EnemyMeta {
  template: EnemyTemplate;
  targetSessionId: string | null;
  lastAttackTime: number;
  lastMoveTime: number;
  spawnX: number;
  spawnY: number;
}

export interface EnemyRuntimeContext {
  state: GameRoomState;
  enemyMeta: Map<string, EnemyMeta>;
  lastPlayerAttack: Map<string, number>;
  playerDbIds: Map<string, number>;
  questService: QuestService;
  nextEnemyId: () => string;
  broadcast: (type: ServerMessage, payload: unknown) => void;
  isSolid: (x: number, y: number) => boolean;
}

export class EnemyService {
  handlePlayerAttack(context: EnemyRuntimeContext, client: Client, data: AttackData): void {
    const player = context.state.players.get(client.sessionId);
    if (!player || player.dead) return;
    if (!data.targetId || typeof data.targetId !== 'string') return;

    const now = Date.now();
    const lastAttack = context.lastPlayerAttack.get(client.sessionId) || 0;
    if (now - lastAttack < ATTACK_COOLDOWN_MS) return;
    context.lastPlayerAttack.set(client.sessionId, now);

    const enemy = context.state.enemies.get(data.targetId);
    if (!enemy) return;

    const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (dist > ATTACK_RANGE) return;

    const weaponBonus = player.equippedWeaponId > 0
      ? (ITEM_DEFINITIONS[player.equippedWeaponId]?.damage ?? 0)
      : 0;
    const baseDmg = BASE_PLAYER_DAMAGE + player.level * 2 + weaponBonus;
    const variance = 0.8 + Math.random() * 0.4;
    const damage = Math.round(baseDmg * variance);

    enemy.hp -= damage;

    context.broadcast(ServerMessage.DamageNumber, {
      targetId: data.targetId,
      damage,
      x: enemy.x,
      y: enemy.y,
    });

    const meta = context.enemyMeta.get(data.targetId);
    if (meta) meta.targetSessionId = client.sessionId;

    if (enemy.hp <= 0) {
      this.killEnemy(context, data.targetId, client);
    }
  }

  tickEnemyAI(context: EnemyRuntimeContext): void {
    const now = Date.now();

    context.state.enemies.forEach((enemy, enemyId) => {
      const meta = context.enemyMeta.get(enemyId);
      if (!meta) return;

      let target: PlayerState | null = null;

      if (meta.targetSessionId) {
        const trackedTarget = context.state.players.get(meta.targetSessionId);
        if (trackedTarget && !trackedTarget.dead) {
          const dist = Math.hypot(trackedTarget.x - enemy.x, trackedTarget.y - enemy.y);
          if (dist < meta.template.aggroRange * 2) {
            target = trackedTarget;
          } else {
            meta.targetSessionId = null;
          }
        } else {
          meta.targetSessionId = null;
        }
      }

      if (!target) {
        let nearest: PlayerState | null = null;
        let nearestDist = Infinity;
        let nearestSid = '';

        context.state.players.forEach((player, sid) => {
          if (player.dead) return;
          const d = Math.hypot(player.x - enemy.x, player.y - enemy.y);
          if (d < meta.template.aggroRange && d < nearestDist) {
            nearest = player;
            nearestDist = d;
            nearestSid = sid;
          }
        });

        if (nearest) {
          target = nearest;
          meta.targetSessionId = nearestSid;
        }
      }

      const moveIntervalMs = 1000 / meta.template.speed;

      if (target) {
        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const dist = Math.hypot(dx, dy);

        if (dist > ATTACK_RANGE * 0.8) {
          // Update facing direction every tick
          enemy.direction = Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? 'right' : 'left')
            : (dy > 0 ? 'down' : 'up');

          // Move exactly 1 tile when the move interval has elapsed
          if (now - meta.lastMoveTime >= moveIntervalMs) {
            meta.lastMoveTime = now;
            const stepX = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
            const stepY = Math.abs(dx) >= Math.abs(dy) ? 0 : Math.sign(dy);
            const newX = Math.max(SAFE_ZONE_MAX_X, Math.min(AO_MAP_SIZE - 1, enemy.x + stepX));
            const newY = Math.max(0, Math.min(AO_MAP_SIZE - 1, enemy.y + stepY));
            if (!context.isSolid(newX, newY)) {
              enemy.x = newX;
              enemy.y = newY;
            }
          }
        } else {
          const now = Date.now();
          if (now - meta.lastAttackTime >= ATTACK_COOLDOWN_MS) {
            meta.lastAttackTime = now;
            const dmg = Math.round(meta.template.damage * (0.8 + Math.random() * 0.4));
            target.hp = Math.max(0, target.hp - dmg);

            context.broadcast(ServerMessage.DamageNumber, {
              targetId: meta.targetSessionId,
              damage: dmg,
              x: target.x,
              y: target.y,
              isPlayer: true,
            });

            if (target.hp <= 0 && !target.dead && meta.targetSessionId) {
              this.handlePlayerDeath(context, meta.targetSessionId);
            }
          }
        }
      } else {
        // No target: return to spawn at half speed
        const dx = meta.spawnX - enemy.x;
        const dy = meta.spawnY - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= 1 && now - meta.lastMoveTime >= moveIntervalMs * 2) {
          meta.lastMoveTime = now;
          const stepX = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
          const stepY = Math.abs(dx) >= Math.abs(dy) ? 0 : Math.sign(dy);
          const newX = Math.max(SAFE_ZONE_MAX_X, Math.min(AO_MAP_SIZE - 1, enemy.x + stepX));
          const newY = Math.max(0, Math.min(AO_MAP_SIZE - 1, enemy.y + stepY));
          if (!context.isSolid(newX, newY)) {
            enemy.x = newX;
            enemy.y = newY;
          }
          enemy.direction = Math.abs(dx) >= Math.abs(dy)
            ? (dx > 0 ? 'right' : 'left')
            : (dy > 0 ? 'down' : 'up');
        }
      }
    });
  }

  spawnEnemies(context: EnemyRuntimeContext): void {
    const currentCount = context.state.enemies.size;
    if (currentCount >= MAX_ENEMIES) return;

    const templates = Object.values(ENEMY_TEMPLATES);
    const toSpawn = Math.min(3, MAX_ENEMIES - currentCount);

    for (let i = 0; i < toSpawn; i++) {
      const template = templates[Math.floor(Math.random() * templates.length)];
      const id = context.nextEnemyId();

      let x = 15 + Math.floor(Math.random() * (AO_MAP_SIZE - 17));
      let y = 2 + Math.floor(Math.random() * (AO_MAP_SIZE - 4));
      let attempts = 0;
      while (context.isSolid(x, y) && attempts < 20) {
        x = 15 + Math.floor(Math.random() * (AO_MAP_SIZE - 17));
        y = 2 + Math.floor(Math.random() * (AO_MAP_SIZE - 4));
        attempts++;
      }
      if (context.isSolid(x, y)) continue;

      const enemy = new EnemyState();
      enemy.id = id;
      enemy.enemyType = template.type;
      enemy.name = template.name;
      enemy.hp = template.hp;
      enemy.hpMax = template.hp;
      enemy.x = x;
      enemy.y = y;
      enemy.direction = 'down';

      context.state.enemies.set(id, enemy);
      context.enemyMeta.set(id, {
        template,
        targetSessionId: null,
        lastAttackTime: 0,
        lastMoveTime: 0,
        spawnX: x,
        spawnY: y,
      });
    }
  }

  clearAggroForSession(enemyMeta: Map<string, EnemyMeta>, sessionId: string): void {
    enemyMeta.forEach((meta) => {
      if (meta.targetSessionId === sessionId) {
        meta.targetSessionId = null;
      }
    });
  }

  private killEnemy(context: EnemyRuntimeContext, enemyId: string, killer: Client): void {
    const enemy = context.state.enemies.get(enemyId);
    const meta = context.enemyMeta.get(enemyId);
    if (!enemy || !meta) return;

    const player = context.state.players.get(killer.sessionId);
    if (!player) return;

    player.xp += meta.template.xpReward;

    const xpNeeded = player.level * XP_PER_LEVEL;
    if (player.xp >= xpNeeded) {
      player.xp -= xpNeeded;
      player.level += 1;
      player.hpMax += HP_PER_LEVEL;
      player.hp = player.hpMax;
      context.broadcast(ServerMessage.LevelUp, {
        sessionId: killer.sessionId,
        name: player.name,
        level: player.level,
      });
    }

    const [minGold, maxGold] = meta.template.goldReward;
    const goldDrop = minGold + Math.floor(Math.random() * (maxGold - minGold + 1));
    player.gold += goldDrop;
    killer.send(ServerMessage.GoldGain, { gold: goldDrop, total: player.gold });

    const charId = context.playerDbIds.get(killer.sessionId);
    if (charId) {
      const lootTable = ENEMY_LOOT_TABLES[meta.template.type] ?? [];
      for (const entry of lootTable) {
        if (Math.random() < entry.chance) {
          const [minQty, maxQty] = entry.quantity;
          const qty = minQty + Math.floor(Math.random() * (maxQty - minQty + 1));
          InventoryRepository.addItem(charId, entry.itemId, qty)
            .then((slot) => {
              if (slot) killer.send(ServerMessage.ItemReceived, slot);
            })
            .catch((err) => console.error('[EnemyService] Loot drop error:', err));
        }
      }
    }

    context.questService.updateQuestProgressOnKill(killer, player, meta.template.type);

    context.broadcast(ServerMessage.EnemyDied, {
      enemyId,
      killerName: player.name,
      enemyName: enemy.name,
    });

    context.state.enemies.delete(enemyId);
    context.enemyMeta.delete(enemyId);
  }

  private handlePlayerDeath(context: EnemyRuntimeContext, sessionId: string): void {
    const player = context.state.players.get(sessionId);
    if (!player) return;
    // Mark player as dead and in ghost mode. They must be revived by the priest NPC.
    player.dead = true;
    player.ghost = true;
    player.hp = 0;

    context.broadcast(ServerMessage.PlayerDied, {
      sessionId,
      name: player.name,
    });
  }
}
