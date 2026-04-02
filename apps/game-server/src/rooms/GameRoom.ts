import { Room, Client } from '@colyseus/core';
import { GameRoomState, PlayerState } from './GameRoomState.js';
import { ClientMessage, ServerMessage } from '@ao/shared-protocol';
import {
  PLAYER_SPEED, MAP_WIDTH, MAP_HEIGHT, TICK_RATE,
  ENEMY_SPAWN_INTERVAL_MS,
  SAFE_SPAWN_X, SAFE_SPAWN_Y,
  ITEM_DEFINITIONS,
  QUEST_NPC,
  MERCHANT_NPC,
  PRIEST_NPC,
  HOUSES,
  NPC_INTERACT_RANGE,
  SAFE_PORTAL,
  DUNGEON_PORTAL,
  PORTAL_INTERACT_RANGE,
  MERCHANT_HEALTH_POTION_ITEM_ID,
  MERCHANT_HEALTH_POTION_PRICE,
} from '@ao/shared-constants';
import { isSolid } from '@ao/shared-utils';
import { verifyToken, type JwtPayload } from '../auth/jwt.js';
import { CharacterRepository, type CharacterRow } from '../db/CharacterRepository.js';
import * as InventoryRepository from '../db/InventoryRepository.js';
import { QuestService } from './services/QuestService.js';
import { ChatService } from './services/ChatService.js';
import { EnemyService, type EnemyMeta, type EnemyRuntimeContext } from './services/EnemyService.js';

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
  private playerDbIds = new Map<string, number>(); // sessionId → character.id
  private lastPlayerAttack = new Map<string, number>(); // sessionId → timestamp
  private enemyMeta = new Map<string, EnemyMeta>(); // enemyId → meta
  private doorStates = new Map<string, boolean>(); // houseId -> open?
  private questService = new QuestService();
  private chatService = new ChatService();
  private enemyService = new EnemyService();
  private enemyIdCounter = 0;
  private spawnTimer: ReturnType<typeof setInterval> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  onCreate() {
    this.state = new GameRoomState();

    // Initialize door states (closed by default)
    for (const h of HOUSES) {
      this.doorStates.set(h.id, false);
    }

    // --- Movement ---
    this.onMessage(ClientMessage.Move, (client: Client, data: MoveData) => {
      const player = this.state.players.get(client.sessionId);
      // Allow movement for ghosts (dead but ghost=true), but block if truly dead without ghost flag
      if (!player || (player.dead && !player.ghost)) return;

      const maxDelta = PLAYER_SPEED / TICK_RATE * 3;
      const dx = Math.abs(data.x - player.x);
      const dy = Math.abs(data.y - player.y);
      if (dx > maxDelta || dy > maxDelta) return;

      const newX = Math.max(0, Math.min(MAP_WIDTH - 1, data.x));
      const newY = Math.max(0, Math.min(MAP_HEIGHT - 1, data.y));

      if (isSolid(newX, newY)) return;

      // Block movement through closed house doors
      for (const h of HOUSES) {
        if (Math.abs(newX - h.doorX) < 0.5 && Math.abs(newY - h.doorY) < 0.5) {
          const open = this.doorStates.get(h.id) || false;
          if (!open) return; // door closed -> block
        }
      }

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

    // --- Door toggle ---
    this.onMessage(ClientMessage.ToggleDoor, (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // Find nearby house door
      for (const h of HOUSES) {
        const dist = Math.hypot(player.x - h.doorX, player.y - h.doorY);
        if (dist <= NPC_INTERACT_RANGE) {
          const currentlyOpen = this.doorStates.get(h.id) || false;
          const newOpen = !currentlyOpen;
          this.doorStates.set(h.id, newOpen);
          // Broadcast new state to all clients
          this.broadcast(ServerMessage.DoorState, { id: h.id, open: newOpen });
          return;
        }
      }
    });

    // --- Ping ---
    this.onMessage(ClientMessage.Ping, (client: Client, data: { t: number }) => {
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

    // --- NPC interaction ---
    this.onMessage(ClientMessage.NpcInteract, async (client: Client, data: { npcId: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // Priest interaction allowed even when dead/ghost
      if (data?.npcId === PRIEST_NPC.id) {
        await this.handlePriestInteract(client, player);
        return;
      }

      // Other NPCs cannot be interacted with while dead/ghost
      if (player.dead) {
        client.send(ServerMessage.NpcDialog, {
          npcName: 'Sistema',
          message: 'No puedes interactuar ahora.',
        });
        return;
      }

      if (data?.npcId === QUEST_NPC.id) {
        this.questService.handleNpcInteract(client, player, data.npcId);
        return;
      }

      if (data?.npcId === MERCHANT_NPC.id) {
        await this.handleMerchantInteract(client, player);
        return;
      }

      client.send(ServerMessage.NpcDialog, {
        npcName: 'Sistema',
        message: 'Ese NPC no existe.',
      });
    });

    // --- Portal interaction ---
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

    // --- Enemy spawn timer ---
    this.spawnTimer = setInterval(
      () => this.enemyService.spawnEnemies(this.getEnemyRuntimeContext()),
      ENEMY_SPAWN_INTERVAL_MS,
    );

    // --- Enemy AI tick ---
    this.tickTimer = setInterval(
      () => this.enemyService.tickEnemyAI(this.getEnemyRuntimeContext()),
      1000 / TICK_RATE,
    );

    // Spawn initial enemies
    this.enemyService.spawnEnemies(this.getEnemyRuntimeContext());

    // --- Auto-save all players periodically ---
    this.autoSaveTimer = setInterval(() => this.saveAllPlayers(), AUTO_SAVE_INTERVAL_MS);
  }

  // ==================== AUTH / JOIN / LEAVE ====================

  async onAuth(_client: Client, options: { token?: string; characterId?: number }) {
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

    return character;
  }

  async onJoin(client: Client, _options: unknown, auth: CharacterRow) {
    const charData = auth;
    this.playerDbIds.set(client.sessionId, charData.id);

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
    const spawnX = !isSolid(charData.pos_x, charData.pos_y) ? charData.pos_x : SAFE_SPAWN_X;
    const spawnY = !isSolid(charData.pos_x, charData.pos_y) ? charData.pos_y : SAFE_SPAWN_Y;
    player.x = spawnX;
    player.y = spawnY;
    player.gold = charData.gold || 0;
    player.equippedWeaponId = charData.equipped_weapon_id ?? 0;
    player.questSlimeKills = charData.quest_slime_kills ?? 0;
    player.questSlimeCompleted = charData.quest_slime_completed ?? false;
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

    // Send current door states so client can render doors correctly
    for (const [id, open] of this.doorStates.entries()) {
      client.send(ServerMessage.DoorState, { id, open });
    }

    this.questService.sendQuestState(client, player);
  }

  async onLeave(client: Client) {
    const charId = this.playerDbIds.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);

    if (player && charId) {
      await this.savePlayer(charId, player).catch((err) =>
        console.error(`[GameRoom] Save error for character ${charId}:`, err),
      );
    }

    // Clear enemy aggro targeting this player
    this.enemyService.clearAggroForSession(this.enemyMeta, client.sessionId);

    this.state.players.delete(client.sessionId);
    this.playerDbIds.delete(client.sessionId);
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

  private async handleMerchantInteract(client: Client, player: PlayerState): Promise<void> {
    const distance = Math.hypot(player.x - MERCHANT_NPC.x, player.y - MERCHANT_NPC.y);
    if (distance > NPC_INTERACT_RANGE) {
      client.send(ServerMessage.NpcDialog, {
        npcName: MERCHANT_NPC.name,
        message: 'Acercate para comerciar conmigo.',
      });
      return;
    }

    const charId = this.playerDbIds.get(client.sessionId);
    if (!charId) return;

    if (player.gold < MERCHANT_HEALTH_POTION_PRICE) {
      client.send(ServerMessage.NpcDialog, {
        npcName: MERCHANT_NPC.name,
        message: `No te alcanza. La pocion cuesta ${MERCHANT_HEALTH_POTION_PRICE} oro.`,
      });
      return;
    }

    const addedItem = await InventoryRepository.addItem(charId, MERCHANT_HEALTH_POTION_ITEM_ID, 1);
    if (!addedItem) {
      client.send(ServerMessage.NpcDialog, {
        npcName: MERCHANT_NPC.name,
        message: 'Tu inventario esta lleno.',
      });
      return;
    }

    player.gold -= MERCHANT_HEALTH_POTION_PRICE;
    client.send(ServerMessage.ItemReceived, addedItem);
    client.send(ServerMessage.NpcDialog, {
      npcName: MERCHANT_NPC.name,
      message: `Hecho. ${addedItem.name} por ${MERCHANT_HEALTH_POTION_PRICE} oro.`,
    });
  }

  private async handlePriestInteract(client: Client, player: PlayerState): Promise<void> {
    const distance = Math.hypot(player.x - PRIEST_NPC.x, player.y - PRIEST_NPC.y);
    if (distance > NPC_INTERACT_RANGE) {
      client.send(ServerMessage.NpcDialog, {
        npcName: PRIEST_NPC.name,
        message: 'Acercate para hablar conmigo.',
      });
      return;
    }

    if (!player.dead || !player.ghost) {
      client.send(ServerMessage.NpcDialog, {
        npcName: PRIEST_NPC.name,
        message: 'No necesitas mi ayuda ahora.',
      });
      return;
    }

    // Revive the player at the priest's location
    player.dead = false;
    player.ghost = false;
    player.hp = player.hpMax;
    player.x = PRIEST_NPC.x;
    player.y = PRIEST_NPC.y;

    const charId = this.playerDbIds.get(client.sessionId);
    if (charId) {
      try {
        await this.savePlayer(charId, player);
      } catch (err) {
        console.error(`[GameRoom] Save error on revive for character ${charId}:`, err);
      }
    }

    this.broadcast(ServerMessage.PlayerRespawned, {
      sessionId: client.sessionId,
      name: player.name,
    });

    client.send(ServerMessage.NpcDialog, {
      npcName: PRIEST_NPC.name,
      message: 'Has sido revivido. ¡Vuelve a la batalla!',
    });
  }

  private handlePortalUse(client: Client, player: PlayerState): void {
    const nearSafePortal = Math.hypot(player.x - SAFE_PORTAL.x, player.y - SAFE_PORTAL.y) <= PORTAL_INTERACT_RANGE;
    const nearDungeonPortal = Math.hypot(player.x - DUNGEON_PORTAL.x, player.y - DUNGEON_PORTAL.y) <= PORTAL_INTERACT_RANGE;

    if (nearSafePortal) {
      if (isSolid(DUNGEON_PORTAL.x, DUNGEON_PORTAL.y)) return;
      player.x = DUNGEON_PORTAL.x;
      player.y = DUNGEON_PORTAL.y;
      client.send(ServerMessage.NpcDialog, {
        npcName: 'Portal',
        message: 'Atravesaste el portal al Santuario Sombrio.',
      });
      return;
    }

    if (nearDungeonPortal) {
      if (isSolid(SAFE_PORTAL.x, SAFE_PORTAL.y)) return;
      player.x = SAFE_PORTAL.x;
      player.y = SAFE_PORTAL.y;
      client.send(ServerMessage.NpcDialog, {
        npcName: 'Portal',
        message: 'Regresaste al campamento.',
      });
      return;
    }

    client.send(ServerMessage.NpcDialog, {
      npcName: 'Portal',
      message: 'No hay un portal activo cerca.',
    });
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
    });
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
