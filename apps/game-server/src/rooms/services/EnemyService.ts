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
  MAP_WIDTH,
  MAP_HEIGHT,
  SAFE_ZONE_MAX_X,
  SAFE_SPAWN_X,
  SAFE_SPAWN_Y,
  TICK_RATE,
  ITEM_DEFINITIONS,
  ENEMY_LOOT_TABLES,
  type EnemyTemplate,
} from '@ao/shared-constants';
import { isSolid } from '@ao/shared-utils';
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
    const dt = 1 / TICK_RATE;

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

      if (target) {
        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const dist = Math.hypot(dx, dy);

        if (dist > ATTACK_RANGE * 0.8) {
          const moveSpeed = meta.template.speed * dt;
          const nx = dx / dist;
          const ny = dy / dist;
          const tryX = enemy.x + nx * moveSpeed;
          const tryY = enemy.y + ny * moveSpeed;

          const clampedX = Math.max(SAFE_ZONE_MAX_X, Math.min(MAP_WIDTH - 1, tryX));
          const clampedY = Math.max(0, Math.min(MAP_HEIGHT - 1, tryY));

          if (!isSolid(clampedX, clampedY)) {
            enemy.x = clampedX;
            enemy.y = clampedY;
          } else if (!isSolid(clampedX, enemy.y)) {
            enemy.x = clampedX;
          } else if (!isSolid(enemy.x, clampedY)) {
            enemy.y = clampedY;
          }

          enemy.direction = Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? 'right' : 'left')
            : (dy > 0 ? 'down' : 'up');
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
        const dx = meta.spawnX - enemy.x;
        const dy = meta.spawnY - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.5) {
          const moveSpeed = meta.template.speed * 0.5 * dt;
          const tryX = Math.max(SAFE_ZONE_MAX_X, Math.min(MAP_WIDTH - 1, enemy.x + (dx / dist) * moveSpeed));
          const tryY = Math.max(0, Math.min(MAP_HEIGHT - 1, enemy.y + (dy / dist) * moveSpeed));
          if (!isSolid(tryX, tryY)) {
            enemy.x = tryX;
            enemy.y = tryY;
          } else if (!isSolid(tryX, enemy.y)) {
            enemy.x = tryX;
          } else if (!isSolid(enemy.x, tryY)) {
            enemy.y = tryY;
          }
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

      let x = 15 + Math.random() * (MAP_WIDTH - 17);
      let y = 2 + Math.random() * (MAP_HEIGHT - 4);
      let attempts = 0;
      while (isSolid(x, y) && attempts < 20) {
        x = 15 + Math.random() * (MAP_WIDTH - 17);
        y = 2 + Math.random() * (MAP_HEIGHT - 4);
        attempts++;
      }
      if (isSolid(x, y)) continue;

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
