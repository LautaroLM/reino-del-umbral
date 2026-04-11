import { Room, Client } from '@colyseus/core';
import { GameRoomState, PlayerState, NpcState, EnemyState } from './GameRoomState.js';
import { ClientMessage, ServerMessage } from '@ao/shared-protocol';
import {
  PLAYER_SPEED, TICK_RATE,
  ENEMY_SPAWN_INTERVAL_MS,
  SAFE_SPAWN_X, SAFE_SPAWN_Y,
  ITEM_DEFINITIONS,
} from '@ao/shared-constants';
import { getWorldData, type WorldDataService } from '../world/WorldDataService.js';
import { verifyToken, type JwtPayload } from '../auth/jwt.js';
import { AccountRepository } from '../db/AccountRepository.js';
import { CharacterRepository, type CharacterRow } from '../db/CharacterRepository.js';
import * as InventoryRepository from '../db/InventoryRepository.js';
import { QuestService } from './services/QuestService.js';
import { ChatService } from './services/ChatService.js';
import { EnemyService, type EnemyMeta, type EnemyRuntimeContext } from './services/EnemyService.js';
import { AO_MAP_SIZE, NpcType } from '@ao/shared-world';

interface MoveData {
  x: number;
  y: number;
  direction: string;
}

interface AttackData {
  targetId: string; // enemy id
}

const AUTO_SAVE_INTERVAL_MS = 30_000;

export class GameRoom extends Room<{ state: GameRoomState }> {
  maxClients = 50;
  private worldData!: WorldDataService;
  private playerDbIds = new Map<string, number>(); // sessionId → character.id
  private playerAccountIds = new Map<string, number>(); // sessionId → account.id
  private lastPlayerAttack = new Map<string, number>(); // sessionId → timestamp
  private enemyMeta = new Map<string, EnemyMeta>(); // enemyId → meta
  private questService = new QuestService();
  private chatService = new ChatService();
  private enemyService = new EnemyService();
  private enemyIdCounter = 0;
  private spawnTimer: ReturnType<typeof setInterval> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  onCreate() {
    this.state = new GameRoomState();
    this.worldData = getWorldData();
    // Preload the starting map(s) into memory and spawn NPCs from AO data
    this.worldData.preloadMaps([1]);
    this.spawnWorldNpcs(1);

    // --- Movement ---
    this.onMessage(ClientMessage.Move, (client: Client, data: MoveData) => {
      const player = this.state.players.get(client.sessionId);
      // Allow movement for ghosts (dead but ghost=true), but block if truly dead without ghost flag
      if (!player || (player.dead && !player.ghost)) return;

      // Allow at least one full tile per input packet for tile-by-tile movement.
      const maxDelta = Math.max(1.001, PLAYER_SPEED / TICK_RATE * 3);
      const dx = Math.abs(data.x - player.x);
      const dy = Math.abs(data.y - player.y);
      if (dx > maxDelta || dy > maxDelta) return;
      // Reject diagonal moves (both axes changed simultaneously)
      if (dx > 0.001 && dy > 0.001) return;

      const mapSize = AO_MAP_SIZE;
      const mapHeight = AO_MAP_SIZE;
      const newX = Math.max(0, Math.min(mapSize - 1, data.x));
      const newY = Math.max(0, Math.min(mapHeight - 1, data.y));

      const solid = this.worldData.isSolid(player.currentMapId, newX, newY);
      if (solid) return;

      // Block movement into an enemy tile (approx 0.6 tile radius)
      const ENTITY_RADIUS = 0.6;
      let blockedByEnemy = false;
      this.state.enemies.forEach((enemy) => {
        if (Math.hypot(newX - enemy.x, newY - enemy.y) < ENTITY_RADIUS) {
          blockedByEnemy = true;
        }
      });
      if (blockedByEnemy) return;

      player.x = newX;
      player.y = newY;
      if (['up', 'down', 'left', 'right'].includes(data.direction)) {
        player.direction = data.direction;
      }
    });

    // --- Request map data ---
    this.onMessage(ClientMessage.RequestMapData, (client: Client, data: { mapId: number }) => {
      if (typeof data?.mapId !== 'number') return;
      const map = this.worldData.getMap(data.mapId);
      if (!map) return;
      client.send(ServerMessage.MapData, {
        mapId: map.mapId,
        width: map.width,
        height: map.height,
        metadata: map.metadata,
        tiles: map.tiles,
      });
    });

    // --- Ping ---
    this.onMessage(ClientMessage.Ping, (client: Client, data: { t: number }) => {
      const accountId = this.playerAccountIds.get(client.sessionId);
      if (accountId) {
        void AccountRepository.touchGameSession(accountId, client.sessionId).catch((err) => {
          console.error(`[GameRoom] Failed to refresh session for account ${accountId}:`, err);
        });
      }

      client.send(ServerMessage.Pong, { t: data.t });
    });

    // --- Chat ---
    this.onMessage(ClientMessage.Chat, (client: Client, data: { message: string }) => {
      this.chatService.handleChat(client, data, this.state.players, (payload) => {
        this.broadcast(ClientMessage.Chat, payload);
      });
    });

    // --- Whisper ---
    this.onMessage(ClientMessage.Whisper, (client: Client, data: { targetName: string; message: string }) => {
      this.chatService.handleWhisper(client, data, this.state.players, this.clients);
    });

    // --- Portal / NPC interaction ---
    this.onMessage(ClientMessage.PortalUse, (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.dead) return;
      this.handlePortalUse(client, player);
    });

    // --- Attack ---
    this.onMessage(ClientMessage.Attack, (client: Client, data: AttackData) => {
      this.enemyService.handlePlayerAttack(this.getEnemyRuntimeContext(), client, data);
    });

    // --- Use item ---
    this.onMessage(ClientMessage.UseItem, (client: Client, data: { slotIndex: number }) => {
      this.handleUseItem(client, data);
    });

    // --- Equip item ---
    this.onMessage(ClientMessage.EquipItem, (client: Client, data: { slotIndex: number }) => {
      this.handleEquipItem(client, data);
    });

    // --- Enemy AI tick ---
    this.tickTimer = setInterval(
      () => this.enemyService.tickEnemyAI(this.getEnemyRuntimeContext()),
      1000 / TICK_RATE,
    );

    // --- Auto-save all players periodically ---
    this.autoSaveTimer = setInterval(() => this.saveAllPlayers(), AUTO_SAVE_INTERVAL_MS);
  }

  // ==================== AUTH / JOIN / LEAVE ====================

  async onAuth(client: Client, options: { token?: string; characterId?: number }) {
    if (!options.token || !options.characterId) {
      throw new Error('Missing token or characterId');
    }

    let payload: JwtPayload;
    try {
      payload = verifyToken(options.token);
    } catch {
      throw new Error('Invalid or expired token');
    }

    const character = await CharacterRepository.findByIdAndAccount(
      options.characterId,
      payload.accountId,
    );

    if (!character) {
      throw new Error('Character not found');
    }

    const sessionClaimed = await AccountRepository.claimGameSession(payload.accountId, client.sessionId);
    if (!sessionClaimed) {
      throw new Error('Esa cuenta ya está conectada en otra sesión. Cerrá la otra conexión para entrar.');
    }

    return { ...character, accountId: payload.accountId };
  }

  async onJoin(client: Client, _options: unknown, auth: CharacterRow) {
    const charData = auth;
    this.playerDbIds.set(client.sessionId, charData.id);
    this.playerAccountIds.set(client.sessionId, (charData as CharacterRow & { accountId: number }).accountId);

    const player = new PlayerState();
    player.name = charData.name;
    player.characterId = charData.id;
    player.race = charData.race;
    player.characterClass = charData.class;
    player.level = charData.level;
    player.xp = charData.experience || 0;
    player.hp = charData.hp_current;
    player.hpMax = charData.hp_max;
    // Use saved position unless it's inside a solid tile (e.g. legacy (0,0) default)
    // Default to AO map 1 (Ciudad de Ullathorpe) for spawning
    const startMapId = charData.current_map_id ?? 1;
    player.currentMapId = this.worldData.hasMap(startMapId) ? startMapId : 1;

    let spawnX = charData.pos_x;
    let spawnY = charData.pos_y;
    if (player.currentMapId > 0) {
      // Validate position against AO world data
      if (this.worldData.isSolid(player.currentMapId, spawnX, spawnY)) {
        const fallback = this.findNearestWalkableAoTile(player.currentMapId, spawnX, spawnY);
        if (fallback) {
          spawnX = fallback.x;
          spawnY = fallback.y;
        } else {
          // Last resort: keep legacy fallback values.
          spawnX = SAFE_SPAWN_X;
          spawnY = SAFE_SPAWN_Y;
        }
      }
      if (spawnX < 0 || spawnY < 0 || spawnX >= AO_MAP_SIZE || spawnY >= AO_MAP_SIZE) {
        spawnX = SAFE_SPAWN_X;
        spawnY = SAFE_SPAWN_Y;
      }
    }
    player.x = spawnX;
    player.y = spawnY;
    player.gold = charData.gold || 0;
    player.equippedWeaponId = charData.equipped_weapon_id ?? 0;
    player.questSlimeKills = charData.quest_slime_kills ?? 0;
    player.questSlimeCompleted = charData.quest_slime_completed ?? false;
    player.idBody = charData.id_body ?? 56;
    player.idHead = charData.id_head ?? 1;
    player.idHelmet = charData.id_helmet ?? 4;
    player.direction = 'down';
    // Restore ghost/dead state from DB so reconnecting as a ghost keeps the penalty
    if (charData.is_ghost) {
      player.dead = true;
      player.ghost = true;
      player.hp = 0;
    } else {
      player.dead = false;
      player.ghost = false;
    }

    this.state.players.set(client.sessionId, player);
    console.log(`[GameRoom] ${charData.name} joined (session: ${client.sessionId})`);

    // Announce join to the room
    this.broadcast(ServerMessage.PlayerJoined, { name: charData.name });

    // Load and send inventory
    try {
      const inventory = await InventoryRepository.loadInventory(charData.id);
      client.send(ServerMessage.InventoryLoad, { items: inventory });
    } catch (err) {
      console.error(`[GameRoom] Inventory load error for character ${charData.id}:`, err);
    }

    this.questService.sendQuestState(client, player);
  }

  async onLeave(client: Client) {
    const charId = this.playerDbIds.get(client.sessionId);
    const accountId = this.playerAccountIds.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);

    if (player && charId) {
      await this.savePlayer(charId, player).catch((err) =>
        console.error(`[GameRoom] Save error for character ${charId}:`, err),
      );
    }

    if (accountId) {
      await AccountRepository.releaseGameSession(accountId, client.sessionId).catch((err) =>
        console.error(`[GameRoom] Release session error for account ${accountId}:`, err),
      );
    }

    // Clear enemy aggro targeting this player
    this.enemyService.clearAggroForSession(this.enemyMeta, client.sessionId);

    this.state.players.delete(client.sessionId);
    this.playerDbIds.delete(client.sessionId);
    this.playerAccountIds.delete(client.sessionId);
    this.lastPlayerAttack.delete(client.sessionId);

    // Announce departure
    if (player?.name) {
      this.broadcast(ServerMessage.PlayerLeft, { name: player.name });
    }
    console.log(`[GameRoom] Player left: ${client.sessionId}`);
  }

  async onDispose() {
    if (this.spawnTimer) clearInterval(this.spawnTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);

    // Save all still-connected players on room close
    await this.saveAllPlayers();

    const sessionReleases: Promise<void>[] = [];
    this.playerAccountIds.forEach((accountId, sessionId) => {
      sessionReleases.push(
        AccountRepository.releaseGameSession(accountId, sessionId).catch((err) =>
          console.error(`[GameRoom] Release session error for account ${accountId}:`, err),
        ),
      );
    });

    await Promise.all(sessionReleases);
  }

  // ==================== INVENTORY ====================

  private nextEnemyId(): string {
    this.enemyIdCounter += 1;
    return `enemy_${this.enemyIdCounter}`;
  }

  private getEnemyRuntimeContext(): EnemyRuntimeContext {
    return {
      state: this.state,
      enemyMeta: this.enemyMeta,
      lastPlayerAttack: this.lastPlayerAttack,
      playerDbIds: this.playerDbIds,
      questService: this.questService,
      nextEnemyId: () => this.nextEnemyId(),
      broadcast: (type, payload) => {
        this.broadcast(type, payload);
      },
      isSolid: (x, y) => this.worldData.isSolid(1, x, y),
    };
  }

  private async handleEquipItem(client: Client, data: { slotIndex: number }) {
    if (typeof data.slotIndex !== 'number') return;

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const charId = this.playerDbIds.get(client.sessionId);
    if (!charId) return;

    // If the player clicks the already-equipped weapon slot → unequip
    const inventory = await InventoryRepository.loadInventory(charId);
    const slot = inventory.find((i) => i.slotIndex === data.slotIndex);
    if (!slot) return;

    const isEquipped = player.equippedWeaponId > 0 &&
      ITEM_DEFINITIONS[player.equippedWeaponId]?.id === slot.itemId &&
      player.equippedWeaponId === slot.itemId;

    if (isEquipped) {
      await InventoryRepository.unequipItem(charId);
      player.equippedWeaponId = 0;
      client.send(ServerMessage.ItemEquipped, { itemId: 0, weaponName: null, damage: 0 });
    } else {
      const itemId = await InventoryRepository.equipItem(charId, data.slotIndex);
      if (!itemId) return;
      const def = ITEM_DEFINITIONS[itemId];
      player.equippedWeaponId = itemId;
      client.send(ServerMessage.ItemEquipped, {
        itemId,
        weaponName: def?.name ?? '',
        damage: def?.damage ?? 0,
      });
    }
  }

  private async handleUseItem(client: Client, data: { slotIndex: number }) {
    if (typeof data.slotIndex !== 'number') return;

    const player = this.state.players.get(client.sessionId);
    if (!player || player.dead) return;

    const charId = this.playerDbIds.get(client.sessionId);
    if (!charId) return;

    // Get slot info before consuming
    const inventory = await InventoryRepository.loadInventory(charId);
    const slot = inventory.find((s) => s.slotIndex === data.slotIndex);
    if (!slot || slot.type !== 'consumable') return;

    const def = ITEM_DEFINITIONS[slot.itemId];
    if (!def?.useEffect) return;

    const remaining = await InventoryRepository.consumeItem(charId, data.slotIndex);
    if (remaining === -1) return; // slot was gone

    // Apply effect server-side
    if (def.useEffect.hpRestore) {
      player.hp = Math.min(player.hpMax, player.hp + def.useEffect.hpRestore);
    }

    client.send(ServerMessage.ItemUsed, {
      slotIndex: data.slotIndex,
      remainingQty: remaining,
      newHp: player.hp,
    });
  }

  private handlePortalUse(client: Client, player: PlayerState): void {
    // 1. Check for a portal tile exit
    const exit = this.worldData.getTileExit(player.currentMapId, player.x, player.y);
    if (exit && this.worldData.hasMap(exit.map)) {
      const destX = exit.x - 1; // 1-indexed → 0-indexed
      const destY = exit.y - 1;
      if (!this.worldData.isSolid(exit.map, destX, destY)) {
        player.currentMapId = exit.map;
        player.x = destX;
        player.y = destY;
        // Preload destination map
        this.worldData.preloadMaps([exit.map]);
        // Notify client about map transition
        const destMap = this.worldData.getMap(exit.map);
        client.send(ServerMessage.MapTransition, {
          mapId: exit.map,
          x: destX,
          y: destY,
          mapName: destMap?.metadata.name ?? `Mapa ${exit.map}`,
        });
        return;
      }
    }

    // 2. Check for a nearby NPC to interact with
    const INTERACT_RADIUS = 1.5;
    let nearestNpc: NpcState | null = null;
    let nearestDist = Infinity;
    this.state.npcs.forEach((npc) => {
      const dist = Math.hypot(player.x - npc.x, player.y - npc.y);
      if (dist <= INTERACT_RADIUS && dist < nearestDist) {
        nearestDist = dist;
        nearestNpc = npc;
      }
    });

    if (nearestNpc) {
      const npc = nearestNpc as NpcState;
      client.send(ServerMessage.NpcDialog, {
        npcName: npc.name,
        message: this.getNpcGreeting(npc.npcType),
      });
      return;
    }

    client.send(ServerMessage.NpcDialog, {
      npcName: 'Sistema',
      message: 'No hay nada con qué interactuar cerca.',
    });
  }

  private getNpcGreeting(npcType: number): string {
    switch (npcType) {
      case NpcType.Priest:   return '¡Que los dioses te protejan, aventurero!';
      case NpcType.Banker:   return 'Bienvenido al banco. ¿En qué puedo ayudarte?';
      case NpcType.Merchant: return '¡Echa un vistazo a mi mercancía!';
      case NpcType.Fisher:   return 'Las aguas están tranquilas hoy...';
      case NpcType.Crafter:  return 'Puedo fabricar lo que necesites.';
      case NpcType.Noble:    return 'Salve, viajero. Bienvenido a estas tierras.';
      default:               return '...';
    }
  }

  // ==================== WORLD NPC SPAWN ====================

  /** Spawns all NPCs for a given map from the imported AO world data.
   *  - Hostile mobs (npcType=0) → EnemyState (participate in combat AI)
   *  - Passive NPCs (all other types) → NpcState (static, interactable with E)
   */
  private spawnWorldNpcs(mapId: number): void {
    const placements = this.worldData.getNpcPlacementsForMap(mapId);
    let hostile = 0;
    let passive = 0;

    for (const placement of placements) {
      const template = this.worldData.npcTemplates[placement.npcIndex];
      if (!template) continue;

      const x = placement.x - 1; // AO data is 1-indexed → 0-indexed
      const y = placement.y - 1;
      const id = `wnpc_${mapId}_${placement.npcIndex}_${x}_${y}`;

      if (template.npcType === NpcType.HostileMob) {
        // Spawn as a combat enemy using real placement stats
        const e = new EnemyState();
        e.id = id;
        e.enemyType = 'mob';
        e.name = template.name;
        e.hp = template.maxHp || 30;
        e.hpMax = template.maxHp || 30;
        e.x = x;
        e.y = y;
        e.direction = 'down';
        e.idBody = template.idBody ?? 0;
        e.idHead = template.idHead ?? 0;
        this.state.enemies.set(id, e);
        this.enemyMeta.set(id, {
          template: {
            type: 'mob',
            name: template.name,
            hp: template.maxHp || 30,
            damage: template.maxHit || 5,
            speed: 1.0,
            aggroRange: 5,
            xpReward: template.exp || 10,
            goldReward: [1, 3],
          },
          targetSessionId: null,
          lastAttackTime: 0,
          lastMoveTime: 0,
          spawnX: x,
          spawnY: y,
        });
        hostile++;
      } else {
        // Spawn as passive NPC
        const npc = new NpcState();
        npc.id = id;
        npc.name = template.name;
        npc.x = x;
        npc.y = y;
        npc.idBody = template.idBody;
        npc.idHead = template.idHead;
        npc.npcType = template.npcType;
        npc.npcIndex = template.npcIndex;
        this.state.npcs.set(id, npc);
        passive++;
      }
    }

    console.log(`[WorldNPC] Map ${mapId}: spawned ${hostile} hostile mobs + ${passive} passive NPCs from AO data`);
  }

  // ==================== PERSISTENCE ====================

  private async savePlayer(charId: number, player: PlayerState): Promise<void> {
    // If ghost: persist ghost state so reconnecting keeps the penalty.
    // HP saved as 0 while dead to signal the ghost state clearly.
    const hpToSave = player.dead ? 0 : Math.max(1, player.hp);

    await CharacterRepository.save(charId, {
      x: player.x,
      y: player.y,
      hp: hpToSave,
      hpMax: player.hpMax,
      xp: player.xp,
      level: player.level,
      gold: player.gold,
      equippedWeaponId: player.equippedWeaponId || null,
      questSlimeKills: player.questSlimeKills,
      questSlimeCompleted: player.questSlimeCompleted,
      ghost: player.ghost,
      currentMapId: player.currentMapId,
    });
  }

  private findNearestWalkableAoTile(
    mapId: number,
    preferredX: number,
    preferredY: number,
  ): { x: number; y: number } | null {
    const map = this.worldData.getMap(mapId);
    if (!map) return null;

    const startX = Math.max(0, Math.min(map.width - 1, Math.round(preferredX)));
    const startY = Math.max(0, Math.min(map.height - 1, Math.round(preferredY)));

    if (!map.tiles[startY]?.[startX]?.blocked) {
      return { x: startX, y: startY };
    }

    const maxRadius = Math.max(map.width, map.height);
    for (let radius = 1; radius <= maxRadius; radius++) {
      const minX = Math.max(0, startX - radius);
      const maxX = Math.min(map.width - 1, startX + radius);
      const minY = Math.max(0, startY - radius);
      const maxY = Math.min(map.height - 1, startY + radius);

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const onPerimeter =
            x === minX || x === maxX || y === minY || y === maxY;
          if (!onPerimeter) continue;

          if (!map.tiles[y]?.[x]?.blocked) {
            return { x, y };
          }
        }
      }
    }

    return null;
  }

  private async saveAllPlayers(): Promise<void> {
    const saves: Promise<void>[] = [];

    this.state.players.forEach((player, sessionId) => {
      const charId = this.playerDbIds.get(sessionId);
      if (!charId) return;
      saves.push(
        this.savePlayer(charId, player).catch((err) =>
          console.error(`[GameRoom] Auto-save error for character ${charId}:`, err),
        ),
      );
    });

    await Promise.all(saves);
    if (saves.length > 0) {
      console.log(`[GameRoom] Auto-saved ${saves.length} player(s).`);
    }
  }
}
