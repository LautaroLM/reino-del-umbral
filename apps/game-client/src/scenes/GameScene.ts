import Phaser from 'phaser';
import { Client, Room, Callbacks } from '@colyseus/sdk';
import { ClientMessage, ServerMessage } from '@ao/shared-protocol';
import {
  TILE_SIZE,
  PLAYER_SPEED,
  ATTACK_RANGE,
  ITEM_DEFINITIONS,
  QUEST_SLIME_REQUIRED_KILLS,
} from '@ao/shared-constants';
import type { MapDefinition } from '@ao/shared-world';
import { AO_MAP_SIZE } from '@ao/shared-world';
import type { InventoryItem } from '@ao/shared-types';
import { ChatOverlay } from './ui/ChatOverlay';
import { InventoryOverlay } from './ui/InventoryOverlay';
import { AoMapRenderer, MAP_DEPTH } from './AoMapRenderer';

const GAME_SERVER_URL = import.meta.env.VITE_WS_URL as string;

interface PlayerData {
  name: string;
  x: number;
  y: number;
  hp: number;
  hpMax: number;
  level: number;
  direction: string;
  characterClass: string;
  currentMapId: number;
  xp: number;
  gold: number;
  dead: boolean;
  ghost: boolean;
  equippedWeaponId: number;
  questSlimeKills: number;
  questSlimeCompleted: boolean;
  /** AO appearance graphic indices */
  idBody:   number;
  idHead:   number;
  idHelmet: number;
}

interface EnemyData {
  id: string;
  enemyType: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  hpMax: number;
  direction: string;
  /** AO graphic indices provided by server when spawned from world NPC templates */
  idBody?: number;
  idHead?: number;
}

interface NpcData {
  id: string;
  name: string;
  x: number;
  y: number;
  idBody: number;
  idHead: number;
  npcType: number;
  npcIndex: number;
}

interface QuestStateData {
  questId: string;
  targetName: string;
  kills: number;
  goal: number;
  completed: boolean;
  rewardGold: number;
}

export class GameScene extends Phaser.Scene {
  // Red
  private client!: Client;
  private room!: Room;
  private mySessionId = '';

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private lastSentX = -1;
  private lastSentY = -1;
  private nextMoveAt = 0;
  private predictedTileX = Number.NaN;
  private predictedTileY = Number.NaN;

  // Sprites de entidades
  private playerSprites = new Map<string, Phaser.GameObjects.Container>();
  private enemySprites  = new Map<string, Phaser.GameObjects.Container>();
  private npcSprites    = new Map<string, Phaser.GameObjects.Container>();
  private selectedEnemyId: string | null = null;
  private lastAttackTime = 0;

  // Mapa AO — todo delegado a AoMapRenderer
  private mapRenderer!: AoMapRenderer;
  private currentMapId = 0;

  // HUD
  private hpText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private chatOverlay!: ChatOverlay;
  private statusText!: Phaser.GameObjects.Text;
  private targetText!: Phaser.GameObjects.Text;
  private questText!: Phaser.GameObjects.Text;
  private pingText!: Phaser.GameObjects.Text;
  private equippedWeaponText!: Phaser.GameObjects.Text;
  private coordsText!: Phaser.GameObjects.Text;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private questProgress: QuestStateData = {
    questId: 'slime_hunt_1',
    targetName: 'Slime',
    kills: 0,
    goal: QUEST_SLIME_REQUIRED_KILLS,
    completed: false,
    rewardGold: 0,
  };

  // UI
  private inventory: InventoryItem[] = [];
  private inventoryOverlay!: InventoryOverlay;
  private equippedWeaponId = 0;

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.mapRenderer = new AoMapRenderer(this);
    this.cameras.main.setBounds(0, 0, AO_MAP_SIZE * TILE_SIZE, AO_MAP_SIZE * TILE_SIZE);
    this.cameras.main.roundPixels = true;

    this.cursors     = this.input.keyboard!.createCursorKeys();
    this.spaceKey    = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.chatOverlay = new ChatOverlay(this.input.keyboard!);
    this.chatOverlay.mount((payload) => {
      if (!this.room) return;
      if (payload.type === 'whisper') {
        this.room.send(ClientMessage.Whisper, { targetName: payload.targetName, message: payload.message });
      } else {
        this.room.send(ClientMessage.Chat, { message: payload.message });
      }
    });

    this.inventoryOverlay = new InventoryOverlay({
      onUseItem:   (i) => this.room?.send(ClientMessage.UseItem,   { slotIndex: i }),
      onEquipItem: (i) => this.room?.send(ClientMessage.EquipItem, { slotIndex: i }),
    });
    this.inventoryOverlay.mount();
    this.input.keyboard!.on('keydown-I', () => {
      this.inventoryOverlay.toggle(this.inventory, this.equippedWeaponId);
    });

    this.buildHud();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.mapRenderer.dispose();
      this.chatOverlay.dispose();
      this.inventoryOverlay.dispose();
      if (this.pingInterval !== null) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    });

    this.connectToServer();
  }

  private buildHud() {
    const D = MAP_DEPTH.HUD;

    this.statusText = this.add.text(10, 10, 'Conectando...', {
      fontSize: '14px', color: '#ffff00', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(D);

    this.hpText = this.add.text(10, 32, '', {
      fontSize: '14px', color: '#ff6666', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(D);

    this.nameText = this.add.text(10, 54, '', {
      fontSize: '14px', color: '#88ccff', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(D);

    this.statsText = this.add.text(10, 76, '', {
      fontSize: '13px', color: '#aaffaa', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(D);

    this.add.text(790, 10, 'I: Inv', {
      fontSize: '12px', color: '#aaaaaa', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(D).setOrigin(1, 0);

    this.add.text(790, 30, 'E: NPC/Portal', {
      fontSize: '12px', color: '#aaaaaa', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(D).setOrigin(1, 0);

    this.pingText = this.add.text(790, 50, 'Ping: --ms', {
      fontSize: '12px', color: '#aaffaa', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(D).setOrigin(1, 0);

    this.coordsText = this.add.text(790, 70, '', {
      fontSize: '12px', color: '#cccccc', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(D).setOrigin(1, 0);

    this.targetText = this.add.text(10, 98, '', {
      fontSize: '13px', color: '#ff8888', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(D);

    this.equippedWeaponText = this.add.text(10, 120, '', {
      fontSize: '13px', color: '#ffdd88', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(D);

    this.questText = this.add.text(10, 142, '', {
      fontSize: '13px', color: '#99ddff', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(D);

    this.questText.setText('');
  }

  private addChatMessage(name: string, message: string, kind: 'chat' | 'system' | 'whisper' | 'loot') {
    this.chatOverlay.addMessage(name, message, kind);
  }

  private async connectToServer(attempt = 1): Promise<void> {
    this.client = new Client(GAME_SERVER_URL);

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const characterId = params.get('characterId');

    if (!token || !characterId) {
      this.statusText.setText('Error: token o personaje no encontrado. Volvé al portal.');
      return;
    }

    try {
      this.room = await this.client.joinOrCreate('game', {
        token,
        characterId: Number(characterId),
      });

      this.mySessionId = this.room.sessionId;
      this.statusText.setText('Conectado — Espacio: atacar');

      const $ = Callbacks.get(this.room);

      this.registerStateCallbacks($);
      this.registerMessageHandlers();

      // Start ping loop every 2 seconds
      this.pingInterval = setInterval(() => {
        if (this.room) {
          this.room.send(ClientMessage.Ping, { t: Date.now() });
        }
      }, 2000);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo conectar';
      const normalized = message.toLowerCase();
      const isSeatReservationExpired =
        normalized.includes('seat reservation') && normalized.includes('expired');

      console.error('[GameScene] Connection error:', err);

      if (isSeatReservationExpired && attempt < 3) {
        this.statusText.setText(`Reintentando conexión... (${attempt}/2)`);
        await new Promise<void>((resolve) => {
          this.time.delayedCall(500, () => resolve());
        });
        return this.connectToServer(attempt + 1);
      }

      if (isSeatReservationExpired) {
        this.statusText.setText('Error: sesión de juego expirada. Volvé a Personajes y entrá de nuevo.');
        return;
      }

      this.statusText.setText(`Error: ${message}`);
    }
  }

  private registerStateCallbacks(callbacks: {
    onAdd: (collection: string, cb: (item: unknown, key: unknown) => void) => void;
    onRemove: (collection: string, cb: (item: unknown, key: unknown) => void) => void;
    onChange: (item: unknown, cb: () => void) => void;
  }) {
    // --- Players ---
    callbacks.onAdd('players', (player: unknown, sessionId: unknown) => {
      const sid = sessionId as string;
      this.addPlayerSprite(sid, player as PlayerData);
      callbacks.onChange(player, () => {
        this.updatePlayerSprite(sid, player as PlayerData);
      });
      // When the local player joins, request AO map data if on an AO map
      if (sid === this.mySessionId) {
        const pd = player as PlayerData;
        this.lastSentX = Math.round(pd.x);
        this.lastSentY = Math.round(pd.y);
        this.predictedTileX = this.lastSentX;
        this.predictedTileY = this.lastSentY;
        this.nextMoveAt = 0;
        if (pd.currentMapId > 0) {
          this.currentMapId = pd.currentMapId;
          this.mapRenderer.clear();
          this.statusText.setText('Cargando mapa...');
          this.room.send(ClientMessage.RequestMapData, { mapId: pd.currentMapId });
        } else {
          this.statusText.setText('Error: mapa no soportado por el cliente.');
        }
      }
    });

    callbacks.onRemove('players', (_player: unknown, sessionId: unknown) => {
      this.removePlayerSprite(sessionId as string);
    });

    // --- Enemies ---
    callbacks.onAdd('enemies', (enemy: unknown, enemyId: unknown) => {
      const eid = enemyId as string;
      this.addEnemySprite(eid, enemy as EnemyData);
      callbacks.onChange(enemy, () => {
        this.updateEnemySprite(eid, enemy as EnemyData);
      });
    });

    callbacks.onRemove('enemies', (_enemy: unknown, enemyId: unknown) => {
      this.removeEnemySprite(enemyId as string);
    });

    // --- Passive NPCs ---
    callbacks.onAdd('npcs', (npc: unknown, npcId: unknown) => {
      const nid = npcId as string;
      this.addNpcSprite(nid, npc as NpcData);
    });

    callbacks.onRemove('npcs', (_npc: unknown, npcId: unknown) => {
      this.removeNpcSprite(npcId as string);
    });
  }

  private registerMessageHandlers() {
    // --- Chat ---
    this.room.onMessage(ClientMessage.Chat, (data: { sessionId: string; name: string; message: string }) => {
      this.addChatMessage(data.name, data.message, 'chat');
    });

    // --- Whisper ---
    this.room.onMessage(ServerMessage.WhisperReceived, (data: { from: string; to: string | null; message: string; isError: boolean }) => {
      if (data.isError) {
        this.addChatMessage('Sistema', data.message, 'system');
      } else {
        const label = data.from === (this.room.state.players.get(this.mySessionId) as PlayerData | undefined)?.name
          ? `→ ${data.to}`
          : `${data.from} → vos`;
        this.addChatMessage(label, data.message, 'whisper');
      }
    });

    this.room.onMessage(ServerMessage.NpcDialog, (data: { npcName: string; message: string }) => {
      this.addChatMessage(data.npcName, data.message, 'system');
    });

    this.room.onMessage(ServerMessage.QuestState, (data: QuestStateData) => {
      this.questProgress = data;
      this.questText.setText('');
    });

    // --- Damage numbers ---
    this.room.onMessage(ServerMessage.DamageNumber, (data: { targetId: string; damage: number; x: number; y: number; isPlayer?: boolean }) => {
      this.showDamageNumber(data.x, data.y, data.damage, data.isPlayer ?? false);
    });

    // --- Enemy died ---
    this.room.onMessage(ServerMessage.EnemyDied, (data: { enemyId: string; killerName: string; enemyName: string }) => {
      this.addChatMessage('Sistema', `${data.killerName} mató a ${data.enemyName}`, 'system');
      if (this.selectedEnemyId === data.enemyId) {
        this.selectedEnemyId = null;
        this.targetText.setText('');
      }
    });

    // --- Player died ---
    this.room.onMessage(ServerMessage.PlayerDied, (data: { sessionId: string; name: string }) => {
      this.addChatMessage('Sistema', `${data.name} ha muerto`, 'system');
    });

    // --- Player respawned ---
    this.room.onMessage(ServerMessage.PlayerRespawned, (data: { sessionId: string; name: string }) => {
      this.addChatMessage('Sistema', `${data.name} ha revivido`, 'system');
    });

    // --- Level up ---
    this.room.onMessage(ServerMessage.LevelUp, (data: { sessionId: string; name: string; level: number }) => {
      this.addChatMessage('Sistema', `¡${data.name} subió a nivel ${data.level}!`, 'system');
    });

    // --- Gold gain ---
    this.room.onMessage(ServerMessage.GoldGain, (data: { gold: number; total: number }) => {
      this.addChatMessage('Sistema', `+${data.gold} oro (total: ${data.total})`, 'system');
    });

    // --- Player joined / left ---
    this.room.onMessage(ServerMessage.PlayerJoined, (data: { name: string }) => {
      this.addChatMessage('Sistema', `${data.name} entró al juego`, 'system');
    });
    this.room.onMessage(ServerMessage.PlayerLeft, (data: { name: string }) => {
      this.addChatMessage('Sistema', `${data.name} salió del juego`, 'system');
    });

    // --- Inventory load ---
    this.room.onMessage(ServerMessage.InventoryLoad, (data: { items: InventoryItem[] }) => {
      this.inventory = data.items;
      this.inventoryOverlay.render(this.inventory, this.equippedWeaponId);
    });

    // --- Item received (from loot drop) ---
    this.room.onMessage(ServerMessage.ItemReceived, (item: InventoryItem) => {
      const idx = this.inventory.findIndex((i) => i.slotIndex === item.slotIndex);
      if (idx >= 0) {
        this.inventory[idx] = item;
      } else {
        this.inventory.push(item);
      }
      this.inventoryOverlay.render(this.inventory, this.equippedWeaponId);
      this.addChatMessage('Loot', `+${item.name} x${item.quantity}`, 'loot');
    });

    // --- Item used ---
    this.room.onMessage(ServerMessage.ItemUsed, (data: { slotIndex: number; remainingQty: number; newHp: number }) => {
      if (data.remainingQty <= 0) {
        this.inventory = this.inventory.filter((i) => i.slotIndex !== data.slotIndex);
      } else {
        const item = this.inventory.find((i) => i.slotIndex === data.slotIndex);
        if (item) item.quantity = data.remainingQty;
      }
      this.inventoryOverlay.render(this.inventory, this.equippedWeaponId);
    });

    // --- Item equipped / unequipped ---
    this.room.onMessage(ServerMessage.ItemEquipped, (data: { itemId: number; weaponName: string | null; damage: number }) => {
      this.equippedWeaponId = data.itemId;
      this.updateEquippedWeaponHud(data.weaponName, data.damage);
      this.inventoryOverlay.render(this.inventory, this.equippedWeaponId);
    });

    this.room.onLeave((code) => {
      this.statusText.setText(`Desconectado (código: ${code})`);
    });

    // --- Pong (ping measurement) ---
    this.room.onMessage(ServerMessage.Pong, (data: { t: number }) => {
      const latency = Date.now() - data.t;
      const color = latency < 80 ? '#aaffaa' : latency < 200 ? '#ffdd88' : '#ff6666';
      this.pingText.setColor(color).setText(`Ping: ${latency}ms`);
    });

    // --- Map data (AO world) ---
    this.room.onMessage(ServerMessage.MapData, (data: MapDefinition) => {
      void this.handleMapData(data);
    });

    // --- Map transition ---
    this.room.onMessage(ServerMessage.MapTransition, (data: { mapId: number; x: number; y: number; mapName: string }) => {
      this.currentMapId = data.mapId;
      this.addChatMessage('Portal', `Entraste a ${data.mapName}`, 'system');
      this.mapRenderer.clear();
      if (data.mapId > 0) {
        this.statusText.setText('Cargando mapa...');
        this.room.send(ClientMessage.RequestMapData, { mapId: data.mapId });
      } else {
        this.statusText.setText('Error: mapa no soportado por el cliente.');
      }
    });
  }

  // ==================== AO MAP RENDERING ====================

  private async handleMapData(map: MapDefinition): Promise<void> {
    this.currentMapId = map.mapId;
    try {
      const appearances = Array.from(
        (this.room.state.players as Map<string, PlayerData>).values(),
      ).map((p) => ({ idBody: p.idBody || 1, idHead: p.idHead || 1, idHelmet: p.idHelmet || 0 }));

      await this.mapRenderer.bootstrap(appearances);
      await this.mapRenderer.preloadMapAssets(map);

      // Precargar assets de NPCs pasivos y enemigos antes de renderizarlos
      const npcMap = this.room.state.npcs as Map<string, NpcData>;
      const enemyMap = this.room.state.enemies as Map<string, EnemyData>;
      const appearancesToPreload: { idBody: number; idHead: number }[] = [];
      if (npcMap) {
        for (const npc of npcMap.values()) {
          if (npc.idBody) appearancesToPreload.push({ idBody: npc.idBody, idHead: npc.idHead || 0 });
        }
      }
      if (enemyMap) {
        for (const enemy of enemyMap.values()) {
          if (enemy.idBody && enemy.idBody > 0) {
            appearancesToPreload.push({ idBody: enemy.idBody, idHead: enemy.idHead ?? 0 });
          }
        }
      }
      if (appearancesToPreload.length) {
        await this.mapRenderer.preloadAppearances(appearancesToPreload);
      }

      this.mapRenderer.buildMap(map);
      this.statusText.setText('');

      // Aplicar capas a jugadores que ya estaban antes de que el renderer estuviera listo
      this.playerSprites.forEach((container, sid) => {
        const p = this.room.state.players.get(sid) as PlayerData | undefined;
        if (p) this.applyCharacterLayers(container, sid, p);
      });

      // Re-aplicar capas a NPCs pasivos (el renderer cargó los assets del mapa)
      this.npcSprites.forEach((container, nid) => {
        const npcMap = this.room.state.npcs as Map<string, NpcData>;
        const npc = npcMap?.get(nid);
        if (npc) {
          this.mapRenderer.applyCharacterLayers(container, {
            idBody:    npc.idBody || 1,
            idHead:    npc.idHead || 0,
            idHelmet:  0,
            direction: 'down',
            name:      npc.name,
            nameColor: '#44ff88',
            ghost:     false,
            dead:      false,
          });
        }
      });

      // Re-aplicar capas a enemigos con apariencia AO
      this.enemySprites.forEach((container, eid) => {
        const enemyMap = this.room.state.enemies as Map<string, EnemyData>;
        const enemy = enemyMap?.get(eid);
        if (enemy && enemy.idBody && enemy.idBody > 0) {
          this.mapRenderer.applyCharacterLayers(container, {
            idBody:    enemy.idBody,
            idHead:    enemy.idHead ?? 0,
            idHelmet:  0,
            direction: enemy.direction || 'down',
            name:      enemy.name,
            nameColor: '#ff4444',
            ghost:     false,
            dead:      false,
          });
        }
      });
    } catch (err) {
      console.error('[GameScene] Error cargando mapa:', err);
      this.mapRenderer.clear();
      this.statusText.setText('Error cargando mapa. Revisar assets.');
    }
  }

  // ==================== PLAYER SPRITES ====================

  private addPlayerSprite(sessionId: string, player: PlayerData) {
    const isSelf = sessionId === this.mySessionId;
    const hpBar = this.add.graphics();
    const label = this.add.text(0, TILE_SIZE / 2 + 4, player.name, {
      fontSize: '14px', fontStyle: 'bold', color: isSelf ? '#0066cc' : '#ffcc66', align: 'center',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0);

    const startX = player.x * TILE_SIZE + TILE_SIZE / 2;
    const startY = player.y * TILE_SIZE + TILE_SIZE / 2;
    const container = this.add.container(startX, startY, [hpBar, label]);
    // Depth is dynamic: container.y is updated every frame in interpolateSprites
    // so it Y-sorts correctly with decoration sprites ((tileY+1)*TILE_SIZE).
    container.setDepth(startY);
    container.setData('targetX',    player.x * TILE_SIZE + TILE_SIZE / 2);
    container.setData('targetY',    player.y * TILE_SIZE + TILE_SIZE / 2);
    container.setData('hpBar',      hpBar);
    container.setData('label',      label);
    container.setData('ghostTween', null);

    if (player.ghost) {
      label.setColor('#dff8ff');
    }

    this.drawHpBar(hpBar, player.hp, player.hpMax);
    this.playerSprites.set(sessionId, container);

    if (isSelf) {
      this.cameras.main.startFollow(container, true, 1, 1);
      this.cameras.main.centerOn(container.x, container.y);
      this.updatePlayerHud(player);
      this.syncQuestFromPlayer(player);
      if (player.equippedWeaponId > 0) {
        this.equippedWeaponId = player.equippedWeaponId;
        const def = ITEM_DEFINITIONS[player.equippedWeaponId];
        this.updateEquippedWeaponHud(def?.name ?? null, def?.damage ?? 0);
      }
    }

    // Apply AO character layers
    this.applyCharacterLayers(container, sessionId, player);
  }

  /** Delega las capas visuales AO a AoMapRenderer. */
  private applyCharacterLayers(
    container: Phaser.GameObjects.Container,
    sessionId: string,
    player: PlayerData,
  ): void {
    this.mapRenderer.applyCharacterLayers(container, {
      idBody:    player.idBody   || 1,
      idHead:    player.idHead   || 1,
      idHelmet:  player.idHelmet || 0,
      direction: player.direction || 'down',
      name:      player.name,
      nameColor: sessionId === this.mySessionId ? '#88ccff' : '#ffcc66',
      ghost:     player.ghost,
      dead:      player.dead,
    });
  }

  private updatePlayerSprite(sessionId: string, player: PlayerData) {
    const container = this.playerSprites.get(sessionId);
    if (!container) return;

    if (sessionId === this.mySessionId) {
      const authX = Math.round(player.x);
      const authY = Math.round(player.y);
      const predictedInvalid = !Number.isFinite(this.predictedTileX) || !Number.isFinite(this.predictedTileY);
      const tooFarFromAuth =
        Math.abs(authX - this.predictedTileX) > 3 || Math.abs(authY - this.predictedTileY) > 3;
      const reachedPredicted = authX === this.predictedTileX && authY === this.predictedTileY;
      if (predictedInvalid || tooFarFromAuth || reachedPredicted) {
        this.predictedTileX = authX;
        this.predictedTileY = authY;
        this.lastSentX = authX;
        this.lastSentY = authY;
      }
    }

    container.setData('targetX', player.x * TILE_SIZE + TILE_SIZE / 2);
    container.setData('targetY', player.y * TILE_SIZE + TILE_SIZE / 2);
    container.setAlpha((player.dead && !player.ghost) ? 0.3 : 1);

    const hpBar = container.getData('hpBar') as Phaser.GameObjects.Graphics;
    if (hpBar) this.drawHpBar(hpBar, player.hp, player.hpMax);

    // Update name label color for ghost/alive transitions
    const label = container.getData('label') as Phaser.GameObjects.Text | undefined;
    if (label) {
      label.setColor(player.ghost ? '#dff8ff' : (sessionId === this.mySessionId ? '#0066cc' : '#ffcc66'));
    }

    // Apply / refresh AO character layers
    this.applyCharacterLayers(container, sessionId, player);

    if (sessionId === this.mySessionId) {
      this.updatePlayerHud(player);
      this.syncQuestFromPlayer(player);
    }
  }

  private removePlayerSprite(sessionId: string) {
    const container = this.playerSprites.get(sessionId);
    if (container) {
      container.destroy();
      this.playerSprites.delete(sessionId);
    }
  }

  // ==================== ENEMY SPRITES ====================

  private addEnemySprite(enemyId: string, enemy: EnemyData) {
    const hpBar = this.add.graphics();
    const eStartX = enemy.x * TILE_SIZE + TILE_SIZE / 2;
    const eStartY = enemy.y * TILE_SIZE + TILE_SIZE / 2;
    const container = this.add.container(eStartX, eStartY, [hpBar]);
    container.setDepth(eStartY);
    container.setData('targetX', enemy.x * TILE_SIZE + TILE_SIZE / 2);
    container.setData('targetY', enemy.y * TILE_SIZE + TILE_SIZE / 2);
    container.setData('hpBar', hpBar);
    container.setData('enemyId', enemyId);

    this.drawHpBar(hpBar, enemy.hp, enemy.hpMax);
    this.enemySprites.set(enemyId, container);

    if (enemy.idBody && enemy.idBody > 0) {
      // Preload AO body/head assets, then apply layered character visuals
      void this.mapRenderer
        .preloadAppearances([{ idBody: enemy.idBody, idHead: enemy.idHead ?? 0 }])
        .then(() => {
          if (!this.enemySprites.has(enemyId)) return;
          this.mapRenderer.applyCharacterLayers(container, {
            idBody:    enemy.idBody!,
            idHead:    enemy.idHead ?? 0,
            idHelmet:  0,
            direction: enemy.direction || 'down',
            name:      enemy.name,
            nameColor: '#ff4444',
            ghost:     false,
            dead:      false,
          });
        });
    } else {
      // No AO appearance — generate a visible placeholder texture
      const texKey = `enemy_placeholder_${enemy.enemyType}`;
      if (!this.textures.exists(texKey)) {
        const gfx = this.add.graphics();
        gfx.fillStyle(0x441111, 1);
        gfx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
        gfx.lineStyle(2, 0xff4444);
        gfx.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
        gfx.generateTexture(texKey, TILE_SIZE, TILE_SIZE);
        gfx.destroy();
      }
      const fallbackSprite = this.add.image(0, 0, texKey);
      const fallbackLabel = this.add.text(0, -TILE_SIZE / 2 - 6, enemy.name, {
        fontSize: '10px', color: '#ff4444', align: 'center',
      }).setOrigin(0.5, 1);
      container.add([fallbackSprite, fallbackLabel]);
    }

    // Click to select enemy
    container.setSize(TILE_SIZE, TILE_SIZE);
    container.setInteractive();
    container.on('pointerdown', () => {
      this.selectedEnemyId = enemyId;
      this.updateTargetHud(enemy);
    });
  }

  private updateEnemySprite(enemyId: string, enemy: EnemyData) {
    const container = this.enemySprites.get(enemyId);
    if (!container) return;

    container.setData('targetX', enemy.x * TILE_SIZE + TILE_SIZE / 2);
    container.setData('targetY', enemy.y * TILE_SIZE + TILE_SIZE / 2);

    const hpBar = container.getData('hpBar') as Phaser.GameObjects.Graphics;
    if (hpBar) this.drawHpBar(hpBar, enemy.hp, enemy.hpMax);

    if (this.selectedEnemyId === enemyId) {
      this.updateTargetHud(enemy);
    }

    // Refresh direction on AO layered enemies
    if (enemy.idBody && enemy.idBody > 0) {
      this.mapRenderer.applyCharacterLayers(container, {
        idBody:    enemy.idBody,
        idHead:    enemy.idHead ?? 0,
        idHelmet:  0,
        direction: enemy.direction || 'down',
        name:      enemy.name,
        nameColor: '#ff4444',
        ghost:     false,
        dead:      false,
      });
    }
  }

  private removeEnemySprite(enemyId: string) {
    const container = this.enemySprites.get(enemyId);
    if (container) {
      container.destroy();
      this.enemySprites.delete(enemyId);
    }
  }

  // ==================== NPC SPRITES ====================

  private addNpcSprite(npcId: string, npc: NpcData) {
    const label = this.add.text(0, TILE_SIZE / 2 + 4, npc.name, {
      fontSize: '12px', color: '#44ff88', align: 'center',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0);

    const px = npc.x * TILE_SIZE + TILE_SIZE / 2;
    const py = npc.y * TILE_SIZE + TILE_SIZE / 2;
    const container = this.add.container(px, py, [label]);
    container.setDepth(py);
    this.npcSprites.set(npcId, container);

    // Preload NPC assets then apply layers (async to handle late-arriving NPCs)
    void this.mapRenderer.preloadAppearances([{ idBody: npc.idBody || 1, idHead: npc.idHead || 0 }]).then(() => {
      if (!this.npcSprites.has(npcId)) return; // NPC was removed while loading
      this.mapRenderer.applyCharacterLayers(container, {
        idBody:    npc.idBody || 1,
        idHead:    npc.idHead || 0,
        idHelmet:  0,
        direction: 'down',
        name:      npc.name,
        nameColor: '#44ff88',
        ghost:     false,
        dead:      false,
      });
    });
  }

  private removeNpcSprite(npcId: string) {
    const container = this.npcSprites.get(npcId);
    if (container) {
      container.destroy();
      this.npcSprites.delete(npcId);
    }
  }

  // ==================== DAMAGE NUMBERS ====================

  private showDamageNumber(x: number, y: number, damage: number, isPlayer: boolean) {
    const px = x * TILE_SIZE + TILE_SIZE / 2;
    const py = y * TILE_SIZE - 10;
    const color = isPlayer ? '#ff4444' : '#ffff00';
    const txt = this.add.text(px, py, `-${damage}`, {
      fontSize: '16px', fontStyle: 'bold', color, stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(200);

    this.tweens.add({
      targets: txt,
      y: py - 30,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    });
  }

  // ==================== DRAWING ====================

  private drawHpBar(gfx: Phaser.GameObjects.Graphics, hp: number, hpMax: number) {
    gfx.clear();
    const w = TILE_SIZE - 4;
    const h = 4;
    const yOff = -TILE_SIZE / 2 - 30;
    gfx.fillStyle(0x333333);
    gfx.fillRect(-w / 2, yOff, w, h);
    const ratio = Math.max(0, hp / (hpMax || 100));
    const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
    gfx.fillStyle(color);
    gfx.fillRect(-w / 2, yOff, w * ratio, h);
  }

  // ==================== HUD ====================

  private updatePlayerHud(player: PlayerData) {
    this.hpText.setText(`HP: ${player.hp}/${player.hpMax}`);
    this.nameText.setText(`${player.name} — Nivel ${player.level} — ${player.characterClass}`);
    const xpNeeded = player.level * 100;
    this.statsText.setText(`XP: ${player.xp}/${xpNeeded}  |  Oro: ${player.gold}`);
    this.coordsText.setText(`Mapa: ${player.currentMapId}  X: ${Math.round(player.x)}  Y: ${Math.round(player.y)}`);
  }

  private updateTargetHud(enemy: EnemyData) {
    this.targetText.setText(`Objetivo: ${enemy.name} — HP: ${enemy.hp}/${enemy.hpMax}`);
  }

  private updateEquippedWeaponHud(weaponName: string | null, damage: number) {
    this.equippedWeaponText.setText(weaponName ? `Arma: ${weaponName} (+${damage} dmg)` : '');
  }

  private syncQuestFromPlayer(player: PlayerData) {
    this.questProgress = {
      ...this.questProgress,
      kills:     player.questSlimeKills ?? 0,
      completed: player.questSlimeCompleted ?? false,
    };
    this.questText.setText('');
  }

  private handlePortalInput() {
    if (!this.room) return;
    if (!Phaser.Input.Keyboard.JustDown(this.interactKey)) return;
    if (this.chatOverlay.isInputFocused()) return;

    const player = this.room.state.players.get(this.mySessionId) as PlayerData | undefined;
    if (!player) return;

    if (this.mapRenderer.isPortalTile(player.x, player.y)) {
      if (player.dead) {
        this.addChatMessage('Sistema', 'No puedes usar portales mientras estás muerto.', 'system');
        return;
      }
      this.room.send(ClientMessage.PortalUse, {});
    } else {
      this.addChatMessage('Sistema', 'No hay portal cerca.', 'system');
    }
  }

  // ==================== GAME LOOP ====================

  update(_time: number, delta: number) {
    if (!this.room) return;

    this.handleMovementInput(delta);
    this.handleAttackInput();
    this.handlePortalInput();
    this.mapRenderer.updateCulling(this.cameras.main);
    this.interpolateSprites(delta);
    this.chatOverlay.tick();
  }

  private handleMovementInput(_delta: number) {
    if (this.chatOverlay.isInputFocused()) return;

    const player = this.room?.state?.players?.get(this.mySessionId) as PlayerData | undefined;
    if (!player || (player.dead && !player.ghost)) return;

    let dx = 0;
    let dy = 0;
    let direction = player.direction;

    if (this.cursors.left.isDown) { dx = -1; direction = 'left'; }
    else if (this.cursors.right.isDown) { dx = 1; direction = 'right'; }
    else if (this.cursors.up.isDown) { dy = -1; direction = 'up'; }
    else if (this.cursors.down.isDown) { dy = 1; direction = 'down'; }

    if (dx === 0 && dy === 0) return;

    if (!this.mapRenderer.currentMapData) return; // mapa no listo aún

    const now = this.time.now;
    if (now < this.nextMoveAt) return;

    const stepIntervalMs = 1000 / PLAYER_SPEED;

    const authTileX = Math.round(player.x);
    const authTileY = Math.round(player.y);
    if (!Number.isFinite(this.predictedTileX) || !Number.isFinite(this.predictedTileY)) {
      this.predictedTileX = authTileX;
      this.predictedTileY = authTileY;
    }

    const mapW = AO_MAP_SIZE;
    const mapH = AO_MAP_SIZE;
    const targetX = Math.max(0, Math.min(mapW - 1, this.predictedTileX + dx));
    const targetY = Math.max(0, Math.min(mapH - 1, this.predictedTileY + dy));

    const checkSolid = (x: number, y: number) => this.mapRenderer.isAoSolid(x, y);
    if (checkSolid(targetX, targetY)) return;

    if (targetX === this.lastSentX && targetY === this.lastSentY) return;

    this.room.send(ClientMessage.Move, { x: targetX, y: targetY, direction });
    this.lastSentX = targetX;
    this.lastSentY = targetY;
    this.predictedTileX = targetX;
    this.predictedTileY = targetY;
    this.nextMoveAt = now + stepIntervalMs;

    // Auto-trigger portal when stepping onto a door tile (AO classic behaviour)
    if (this.mapRenderer.isPortalTile(targetX, targetY)) {
      this.room.send(ClientMessage.PortalUse, {});
    }

    // Client-side prediction: move local container immediately so camera doesn't lag
    const selfContainer = this.playerSprites.get(this.mySessionId);
    if (selfContainer) {
      selfContainer.setData('targetX', targetX * TILE_SIZE + TILE_SIZE / 2);
      selfContainer.setData('targetY', targetY * TILE_SIZE + TILE_SIZE / 2);
    }
  }

  private handleAttackInput() {
    if (this.chatOverlay.isInputFocused()) return;
    if (!this.spaceKey.isDown) return;

    const now = Date.now();
    if (now - this.lastAttackTime < 300) return; // debounce client-side
    this.lastAttackTime = now;

    const player = this.room?.state?.players?.get(this.mySessionId) as PlayerData | undefined;
    if (!player || player.dead) return;

    // Auto-target nearest enemy if none selected
    if (!this.selectedEnemyId || !this.room.state.enemies.get(this.selectedEnemyId)) {
      this.selectedEnemyId = this.findNearestEnemy(player.x, player.y);
    }

    if (this.selectedEnemyId) {
      this.room.send(ClientMessage.Attack, { targetId: this.selectedEnemyId });
    }
  }

  private findNearestEnemy(px: number, py: number): string | null {
    let nearest: string | null = null;
    let nearestDist = Infinity;

    this.room.state.enemies.forEach((enemy: EnemyData, eid: string) => {
      const d = Math.hypot(enemy.x - px, enemy.y - py);
      if (d < ATTACK_RANGE * 1.5 && d < nearestDist) {
        nearestDist = d;
        nearest = eid as string;
      }
    });

    return nearest;
  }

  private interpolateSprites(delta: number) {
    const playerStepPx = TILE_SIZE * PLAYER_SPEED * (delta / 1000);
    const enemyStepPx  = TILE_SIZE * PLAYER_SPEED * (delta / 1000);

    this.playerSprites.forEach((container) => {
      const tx = container.getData('targetX') as number;
      const ty = container.getData('targetY') as number;
      const prevX = container.x;
      const prevY = container.y;
      const dx = tx - container.x;
      const dy = ty - container.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= playerStepPx || distance < 0.001) {
        container.x = tx;
        container.y = ty;
      } else {
        const ratio = playerStepPx / distance;
        container.x += dx * ratio;
        container.y += dy * ratio;
      }
      // Y-sort: depth = pixel Y of the container centre (≈ character waist).
      // Decoration sprites use depth = (tileY+1)*TILE_SIZE (foot of their tile),
      // so a character whose centre is above a deco tile's foot renders behind it.
      container.setDepth(container.y);

      const isMoving = Math.abs(container.x - prevX) > 0.5 || Math.abs(container.y - prevY) > 0.5;
      this.mapRenderer.tickCharacter(container, delta, isMoving);
    });

    this.enemySprites.forEach((container) => {
      const tx = container.getData('targetX') as number;
      const ty = container.getData('targetY') as number;
      const prevX = container.x;
      const prevY = container.y;
      const dx = tx - container.x;
      const dy = ty - container.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= enemyStepPx || dist < 0.001) {
        container.x = tx;
        container.y = ty;
      } else {
        const ratio = enemyStepPx / dist;
        container.x += dx * ratio;
        container.y += dy * ratio;
      }
      container.setDepth(container.y);

      const isMoving = Math.abs(container.x - prevX) > 0.5 || Math.abs(container.y - prevY) > 0.5;
      this.mapRenderer.tickCharacter(container, delta, isMoving);
    });

    // Highlight selected enemy
    this.enemySprites.forEach((container, id) => {
      const sprites = container.list as Phaser.GameObjects.GameObject[];
      const sprite = sprites.find(s => s instanceof Phaser.GameObjects.Image) as Phaser.GameObjects.Image;
      if (sprite) {
        sprite.setTint(id === this.selectedEnemyId ? 0xff8888 : 0xffffff);
      }
    });
  }
}
