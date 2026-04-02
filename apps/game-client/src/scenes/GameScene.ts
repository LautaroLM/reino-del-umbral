import Phaser from 'phaser';
import { Client, Room, Callbacks } from '@colyseus/sdk';
import { ClientMessage, ServerMessage } from '@ao/shared-protocol';
import {
  TILE_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  PLAYER_SPEED,
  ATTACK_RANGE,
  MAP_LAYOUT,
  ITEM_DEFINITIONS,
  SAFE_ZONE_MAX_X,
  QUEST_NPC,
  MERCHANT_NPC,
  PRIEST_NPC,
  HOUSES,
  NPC_INTERACT_RANGE,
  SAFE_PORTAL,
  DUNGEON_PORTAL,
  PORTAL_INTERACT_RANGE,
  DUNGEON_FLOOR_ZONE,
  DESERT_BIOME_ZONE,
  QUEST_SLIME_REQUIRED_KILLS,
} from '@ao/shared-constants';
import { isSolid } from '@ao/shared-utils';
import type { InventoryItem } from '@ao/shared-types';
import { ChatOverlay } from './ui/ChatOverlay';
import { InventoryOverlay } from './ui/InventoryOverlay';

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
  xp: number;
  gold: number;
  dead: boolean;
  ghost: boolean;
  equippedWeaponId: number;
  questSlimeKills: number;
  questSlimeCompleted: boolean;
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
  private static readonly TILE_SAFE_GRASS = 0;
  private static readonly TILE_COMBAT_GRASS = 1;
  private static readonly TILE_WALL = 2;
  private static readonly TILE_DUNGEON_FLOOR = 3;
  private static readonly TILE_DESERT_FLOOR = 4;

  private client!: Client;
  private room!: Room;
  private playerSprites = new Map<string, Phaser.GameObjects.Container>();
  private enemySprites = new Map<string, Phaser.GameObjects.Container>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private mySessionId = '';
  private lastSentX = -1;
  private lastSentY = -1;
  private selectedEnemyId: string | null = null;
  private lastAttackTime = 0;

  // HUD
  private hpText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private chatOverlay!: ChatOverlay;
  private statusText!: Phaser.GameObjects.Text;
  private targetText!: Phaser.GameObjects.Text;
  private questText!: Phaser.GameObjects.Text;
  private pingText!: Phaser.GameObjects.Text;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private questProgress: QuestStateData = {
    questId: 'slime_hunt_1',
    targetName: 'Slime',
    kills: 0,
    goal: QUEST_SLIME_REQUIRED_KILLS,
    completed: false,
    rewardGold: 0,
  };
  private npcContainer: Phaser.GameObjects.Container | null = null;
  private merchantNpcContainer: Phaser.GameObjects.Container | null = null;
  private portalContainers: Phaser.GameObjects.Container[] = [];
  private houseContainers = new Map<string, {
    container: Phaser.GameObjects.Container;
    roof: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
    door: Phaser.GameObjects.Image;
    interiorTiles: Phaser.GameObjects.Image[];
    defId: string;
  }>();

  // Inventory
  private inventory: InventoryItem[] = [];
  private inventoryOverlay!: InventoryOverlay;
  private equippedWeaponId: number = 0;
  private equippedWeaponText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.createMapLayers();

    this.addQuestNpc();
    this.addMerchantNpc();
    this.addPriestNpc();
    this.addHouses();
    this.addPortals();

    // Camera
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);

    // Keyboard
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.chatOverlay = new ChatOverlay(this.input.keyboard!);
    this.chatOverlay.mount((payload) => {
      if (!this.room) return;
      if (payload.type === 'whisper') {
        this.room.send(ClientMessage.Whisper, {
          targetName: payload.targetName,
          message: payload.message,
        });
      } else {
        this.room.send(ClientMessage.Chat, { message: payload.message });
      }
    });

    this.inventoryOverlay = new InventoryOverlay({
      onUseItem: (slotIndex) => {
        if (!this.room) return;
        this.room.send(ClientMessage.UseItem, { slotIndex });
      },
      onEquipItem: (slotIndex) => {
        if (!this.room) return;
        this.room.send(ClientMessage.EquipItem, { slotIndex });
      },
    });
    this.inventoryOverlay.mount();
    this.input.keyboard!.on('keydown-I', () => {
      this.inventoryOverlay.toggle(this.inventory, this.equippedWeaponId);
    });

    // HUD
    this.statusText = this.add.text(10, 10, 'Conectando...', {
      fontSize: '14px', color: '#ffff00', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(100);

    this.hpText = this.add.text(10, 32, '', {
      fontSize: '14px', color: '#ff6666', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(100);

    this.nameText = this.add.text(10, 54, '', {
      fontSize: '14px', color: '#88ccff', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(100);

    this.statsText = this.add.text(10, 76, '', {
      fontSize: '13px', color: '#aaffaa', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(100);

    this.add.text(790, 10, 'I: Inv', {
      fontSize: '12px', color: '#aaaaaa', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(100).setOrigin(1, 0);

    this.add.text(790, 30, 'E: NPC/Portal', {
      fontSize: '12px', color: '#aaaaaa', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(100).setOrigin(1, 0);

    this.pingText = this.add.text(790, 50, 'Ping: --ms', {
      fontSize: '12px', color: '#aaffaa', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(100).setOrigin(1, 0);

    this.targetText = this.add.text(10, 98, '', {
      fontSize: '13px', color: '#ff8888', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(100);

    this.equippedWeaponText = this.add.text(10, 120, '', {
      fontSize: '13px', color: '#ffdd88', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(100);

    this.questText = this.add.text(10, 142, '', {
      fontSize: '13px', color: '#99ddff', backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(100);

    this.updateQuestHUD();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.chatOverlay.dispose();
      this.inventoryOverlay.dispose();
      if (this.pingInterval !== null) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    });

    this.connectToServer();
  }

  private createMapLayers() {
    const groundData: number[][] = [];
    const wallData: number[][] = [];

    for (let y = 0; y < MAP_HEIGHT; y++) {
      const groundRow: number[] = [];
      const wallRow: number[] = [];

      for (let x = 0; x < MAP_WIDTH; x++) {
        const isWall = MAP_LAYOUT[y][x] === 1;
        const inDungeonFloor =
          x >= DUNGEON_FLOOR_ZONE.minX &&
          x <= DUNGEON_FLOOR_ZONE.maxX &&
          y >= DUNGEON_FLOOR_ZONE.minY &&
          y <= DUNGEON_FLOOR_ZONE.maxY;

        const inDesertBiome =
          x >= DESERT_BIOME_ZONE.minX &&
          x <= DESERT_BIOME_ZONE.maxX &&
          y >= DESERT_BIOME_ZONE.minY &&
          y <= DESERT_BIOME_ZONE.maxY;

        const groundTile = inDungeonFloor
          ? GameScene.TILE_DUNGEON_FLOOR
          : inDesertBiome
            ? GameScene.TILE_DESERT_FLOOR
          : x < SAFE_ZONE_MAX_X
            ? GameScene.TILE_SAFE_GRASS
            : GameScene.TILE_COMBAT_GRASS;

        groundRow.push(groundTile);
        wallRow.push(isWall ? GameScene.TILE_WALL : -1);
      }

      groundData.push(groundRow);
      wallData.push(wallRow);
    }

    const groundMap = this.make.tilemap({
      data: groundData,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const wallMap = this.make.tilemap({
      data: wallData,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });

    const groundTileset = groundMap.addTilesetImage('world_tiles', 'world_tiles', TILE_SIZE, TILE_SIZE, 0, 0);
    const wallTileset = wallMap.addTilesetImage('world_tiles', 'world_tiles', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!groundTileset || !wallTileset) {
      throw new Error('No se pudo crear el tileset del mapa');
    }

    const groundLayer = groundMap.createLayer(0, groundTileset, 0, 0);
    const wallLayer = wallMap.createLayer(0, wallTileset, 0, 0);
    groundLayer?.setDepth(0);
    wallLayer?.setDepth(1);

    // Zone divider line (safe zone | combat zone)
    const divider = this.add.graphics();
    divider.lineStyle(3, 0xffd700, 0.7);
    divider.lineBetween(SAFE_ZONE_MAX_X * TILE_SIZE, 0, SAFE_ZONE_MAX_X * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    divider.setDepth(2);

    // "Zona Segura" sign at the top of the divider
    this.add.text(SAFE_ZONE_MAX_X * TILE_SIZE / 2, 8, '⚔ Zona Segura ⚔', {
      fontSize: '10px', color: '#ffe066',
      backgroundColor: '#00000077', padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 0).setDepth(3).setScrollFactor(1);

    // Desert biome marker
    const desertDividerX = DESERT_BIOME_ZONE.minX * TILE_SIZE;
    const desertDivider = this.add.graphics();
    desertDivider.lineStyle(3, 0xffb347, 0.7);
    desertDivider.lineBetween(desertDividerX, 0, desertDividerX, MAP_HEIGHT * TILE_SIZE);
    desertDivider.setDepth(2);

    this.add.text(
      ((DESERT_BIOME_ZONE.minX + DESERT_BIOME_ZONE.maxX) / 2) * TILE_SIZE,
      8,
      '☀ Desierto de Ceniza ☀',
      {
        fontSize: '10px',
        color: '#ffd59a',
        backgroundColor: '#00000077',
        padding: { x: 4, y: 2 },
      },
    ).setOrigin(0.5, 0).setDepth(3).setScrollFactor(1);
  }

  private addPortals() {
    const portals = [
      { name: 'Portal al Santuario', x: SAFE_PORTAL.x, y: SAFE_PORTAL.y },
      { name: 'Portal al Campamento', x: DUNGEON_PORTAL.x, y: DUNGEON_PORTAL.y },
    ];

    for (const portal of portals) {
      const px = portal.x * TILE_SIZE + TILE_SIZE / 2;
      const py = portal.y * TILE_SIZE + TILE_SIZE / 2;

      const sprite = this.add.image(0, 0, 'portal_rune');
      const label = this.add.text(0, -TILE_SIZE / 2 - 8, portal.name, {
        fontSize: '10px', color: '#d8c6ff', align: 'center',
        backgroundColor: '#00000066', padding: { x: 3, y: 1 },
      }).setOrigin(0.5, 1);

      const hint = this.add.text(0, TILE_SIZE / 2 + 4, 'E: viajar', {
        fontSize: '10px', color: '#f0e8ff', align: 'center',
        backgroundColor: '#00000055', padding: { x: 2, y: 1 },
      }).setOrigin(0.5, 0);

      const container = this.add.container(px, py, [sprite, label, hint]);
      container.setDepth(7);

      this.tweens.add({
        targets: sprite,
        alpha: { from: 0.6, to: 1 },
        duration: 900,
        ease: 'Sine.InOut',
        yoyo: true,
        repeat: -1,
      });

      this.portalContainers.push(container);
    }
  }

  private addQuestNpc() {
    const x = QUEST_NPC.x * TILE_SIZE + TILE_SIZE / 2;
    const y = QUEST_NPC.y * TILE_SIZE + TILE_SIZE / 2;

    const sprite = this.add.image(0, 0, 'npc_questgiver');
    const label = this.add.text(0, -TILE_SIZE / 2 - 8, QUEST_NPC.name, {
      fontSize: '11px', color: '#ffe8a3', align: 'center',
      backgroundColor: '#00000066', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1);

    const hint = this.add.text(0, TILE_SIZE / 2 + 4, 'E: hablar', {
      fontSize: '10px', color: '#fff4cc', align: 'center',
      backgroundColor: '#00000055', padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 0);

    this.npcContainer = this.add.container(x, y, [sprite, label, hint]);
    this.npcContainer.setDepth(7);
  }

  private addMerchantNpc() {
    const x = MERCHANT_NPC.x * TILE_SIZE + TILE_SIZE / 2;
    const y = MERCHANT_NPC.y * TILE_SIZE + TILE_SIZE / 2;

    const sprite = this.add.image(0, 0, 'npc_questgiver');
    const label = this.add.text(0, -TILE_SIZE / 2 - 8, MERCHANT_NPC.name, {
      fontSize: '11px', color: '#b8f5b8', align: 'center',
      backgroundColor: '#00000066', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1);

    const hint = this.add.text(0, TILE_SIZE / 2 + 4, 'E: comerciar', {
      fontSize: '10px', color: '#dcffdc', align: 'center',
      backgroundColor: '#00000055', padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 0);

    this.merchantNpcContainer = this.add.container(x, y, [sprite, label, hint]);
    this.merchantNpcContainer.setDepth(7);
  }

  private addPriestNpc() {
    const x = PRIEST_NPC.x * TILE_SIZE + TILE_SIZE / 2;
    const y = PRIEST_NPC.y * TILE_SIZE + TILE_SIZE / 2;

    const sprite = this.add.image(0, 0, 'npc_questgiver');
    const label = this.add.text(0, -TILE_SIZE / 2 - 8, PRIEST_NPC.name, {
      fontSize: '11px', color: '#ffd6e6', align: 'center',
      backgroundColor: '#00000066', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1);

    const hint = this.add.text(0, TILE_SIZE / 2 + 4, 'E: revivir', {
      fontSize: '10px', color: '#ffd6e6', align: 'center',
      backgroundColor: '#00000055', padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 0);

    const container = this.add.container(x, y, [sprite, label, hint]);
    container.setDepth(7);
  }

  private addHouses() {
    for (const h of HOUSES) {
      const interiorTiles: Phaser.GameObjects.Image[] = [];

      // ── Interior floor (visible under translucent roof when inside) ──
      for (let yy = h.interiorMinY; yy <= h.interiorMaxY; yy++) {
        for (let xx = h.interiorMinX; xx <= h.interiorMaxX; xx++) {
          const floor = this.add.image(xx * TILE_SIZE + TILE_SIZE / 2, yy * TILE_SIZE + TILE_SIZE / 2, 'interior_floor');
          floor.setDepth(6);
          interiorTiles.push(floor);
        }
      }

      // ── Front face: only the BOTTOM row visible (top-down perspective) ──
      // Back/side walls are hidden under the roof — only the front facade is shown.
      const frontY = h.y + h.height - 1;
      for (let xx = h.x; xx < h.x + h.width; xx++) {
        if (xx === h.doorX && frontY === h.doorY) continue; // door rendered separately
        const px = xx * TILE_SIZE + TILE_SIZE / 2;
        const py = frontY * TILE_SIZE + TILE_SIZE / 2;
        // Windows beside the door on the front face
        const isWindow = (xx === h.x + 1 || xx === h.x + h.width - 2);
        this.add.image(px, py, isWindow ? 'house_wall_window' : 'house_wall').setDepth(8);
      }

      // Door: wall backing + door sprite on top
      const doorPx = h.doorX * TILE_SIZE + TILE_SIZE / 2;
      const doorPy = h.doorY * TILE_SIZE + TILE_SIZE / 2;
      this.add.image(doorPx, doorPy, 'house_wall').setDepth(8);
      const door = this.add.image(doorPx, doorPy, 'door_closed').setDepth(9);

      // ────────────────────────────────────────────────────────────────────
      // Roof: flat top-down view of a clay-tile roof with 3/4 perspective cues
      //   • Covers all rows except the front face row (which stays always seen)
      //   • Small overhang extends ~0.35 tiles over the front face to cast shadow
      //   • Shingle gradient: very dark at the back (far from viewer) →
      //     warm terracotta at the front eave (close to viewer)
      //   • Staggered vertical joints + ridge cap + side shadows + chimney
      // ────────────────────────────────────────────────────────────────────
      const roofGfx = this.add.graphics();

      const ovhX   = 0.3;   // side overhang (tiles)
      const ovhTop = 0.2;   // back-edge overhang (tiles)
      const ovhBot = 0.35;  // front overhang into front-face row (tiles)

      const rx = (h.x - ovhX) * TILE_SIZE;
      const ry = (h.y - ovhTop) * TILE_SIZE;
      const rw = (h.width + ovhX * 2) * TILE_SIZE;
      // Covers rows h.y..h.y+height-2 (all except front), plus front overhang
      const rh = (h.height - 1 + ovhBot) * TILE_SIZE;

      // Shingle rows with dark-back → warm-front gradient
      const shingleH = 7;
      const numRows  = Math.ceil(rh / shingleH);
      for (let row = 0; row < numRows; row++) {
        const t  = row / Math.max(1, numRows - 1);  // 0 = back, 1 = front
        const cr = Math.min(255, Math.round(0x46 + t * 0x44));
        const cg = Math.min(255, Math.round(0x12 + t * 0x24));
        const cb = Math.min(255, Math.round(0x04 + t * 0x10));
        // Alternate rows slightly lighter for individual tile definition
        const dr = row % 2 === 0 ? cr : Math.min(255, cr + 16);
        const dg = row % 2 === 0 ? cg : Math.min(255, cg + 9);
        const db = row % 2 === 0 ? cb : Math.min(255, cb + 5);

        roofGfx.fillStyle((dr << 16) | (dg << 8) | db);
        const rowY = ry + row * shingleH;
        roofGfx.fillRect(rx, rowY, rw, Math.min(shingleH - 1, ry + rh - rowY));

        // Staggered vertical joints between shingles
        roofGfx.fillStyle(0x240804, 0.55);
        const jointOfs = (row % 2 === 0) ? 0 : TILE_SIZE * 0.45;
        for (let jx = rx + jointOfs; jx < rx + rw; jx += TILE_SIZE * 0.9) {
          roofGfx.fillRect(Math.round(jx), rowY, 1, shingleH - 1);
        }
      }

      // Ridge cap at the very back edge (highest visible point of the roof)
      roofGfx.fillStyle(0xb86838);
      roofGfx.fillRect(rx + 10, ry, rw - 20, 6);
      roofGfx.fillStyle(0xd89060, 0.65);
      roofGfx.fillRect(rx + 13, ry + 1, rw - 26, 3);

      // Light highlight — upper-right ambient light
      roofGfx.fillStyle(0xffffff, 0.06);
      roofGfx.fillTriangle(rx + rw * 0.6, ry, rx + rw + 2, ry, rx + rw + 2, ry + rh);

      // Shadow band — left side
      roofGfx.fillStyle(0x000000, 0.1);
      roofGfx.fillTriangle(rx - 2, ry, rx + rw * 0.4, ry, rx - 2, ry + rh);

      // Front eave lip (closest edge to viewer — bright terracotta cap)
      roofGfx.fillStyle(0xaa5230, 0.95);
      roofGfx.fillRect(rx, ry + rh - 6, rw, 6);

      // Drop shadow cast downward from eave onto tops of front wall tiles
      roofGfx.fillStyle(0x000000, 0.35);
      roofGfx.fillRect(rx + 3, ry + rh, rw - 6, 7);

      // Side gable edges (shadow on the left, slight highlight on the right)
      roofGfx.fillStyle(0x2e0e04, 0.85);
      roofGfx.fillRect(rx, ry, Math.round(TILE_SIZE * 0.28), rh);
      roofGfx.fillStyle(0x7a3820, 0.7);
      roofGfx.fillRect(rx + rw - Math.round(TILE_SIZE * 0.28), ry, Math.round(TILE_SIZE * 0.28), rh);

      // Chimney (brick stack, slightly off-center toward right)
      const chimneyX = Math.round((h.x + h.width * 0.62) * TILE_SIZE);
      const chimneyTop = Math.round(ry + rh * 0.08);
      roofGfx.fillStyle(0xa06848);
      roofGfx.fillRect(chimneyX - 5, chimneyTop, 11, 14);
      // Chimney cap (slightly wider, darker)
      roofGfx.fillStyle(0x6a4028);
      roofGfx.fillRect(chimneyX - 7, chimneyTop - 3, 15, 4);
      // Soot darkening around top opening
      roofGfx.fillStyle(0x1a0a04, 0.4);
      roofGfx.fillRect(chimneyX - 5, chimneyTop - 1, 11, 3);

      roofGfx.setDepth(50);

      this.houseContainers.set(h.id, {
        container: this.add.container(0, 0, []),
        roof: roofGfx,
        door,
        interiorTiles,
        defId: h.id,
      });
    }
  }

  private addChatMessage(name: string, message: string, kind: 'chat' | 'system' | 'whisper' | 'loot') {
    this.chatOverlay.addMessage(name, message, kind);
  }

  private async connectToServer() {
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

      this.registerRoomMessageHandlers();

      // Start ping loop every 2 seconds
      this.pingInterval = setInterval(() => {
        if (this.room) {
          this.room.send(ClientMessage.Ping, { t: Date.now() });
        }
      }, 2000);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo conectar';
      console.error('[GameScene] Connection error:', err);
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
  }

  private registerRoomMessageHandlers() {
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

    this.room.onMessage(ServerMessage.DoorState, (data: { id: string; open: boolean }) => {
      const h = this.houseContainers.get(data.id);
      if (!h) return;
      h.door.setTexture(data.open ? 'door_open' : 'door_closed');
    });

    this.room.onMessage(ServerMessage.QuestState, (data: QuestStateData) => {
      this.questProgress = data;
      this.updateQuestHUD();
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
      this.updateEquippedWeaponHUD(data.weaponName, data.damage);
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
  }

  // ==================== PLAYER SPRITES ====================

  private addPlayerSprite(sessionId: string, player: PlayerData) {
    const isSelf = sessionId === this.mySessionId;
    const sprite = this.add.image(0, 0, isSelf ? 'player_self' : 'player_other');
    const label = this.add.text(0, -TILE_SIZE / 2 - 6, player.name, {
      fontSize: '11px', color: isSelf ? '#88ccff' : '#ffcc66', align: 'center',
    }).setOrigin(0.5, 1);

    const hpBar = this.add.graphics();
    const container = this.add.container(
      player.x * TILE_SIZE + TILE_SIZE / 2,
      player.y * TILE_SIZE + TILE_SIZE / 2,
      [hpBar, sprite, label],
    );
    container.setDepth(10);
    container.setData('targetX', player.x * TILE_SIZE + TILE_SIZE / 2);
    container.setData('targetY', player.y * TILE_SIZE + TILE_SIZE / 2);
    container.setData('hpBar', hpBar);
    container.setData('sprite', sprite);
    container.setData('label', label);
    container.setData('ghostTween', null);

    // If the player is already a ghost on spawn, apply ghost visuals/tween
    if (player.ghost) {
      sprite.setTexture('player_ghost');
      sprite.setAlpha(0.95);
      label.setColor('#dff8ff');
      const tween = this.tweens.add({
        targets: sprite,
        y: { from: -6, to: -2 },
        duration: 900,
        ease: 'Sine.InOut',
        yoyo: true,
        repeat: -1,
      });
      container.setData('ghostTween', tween);
    }

    this.drawHpBar(hpBar, player.hp, player.hpMax);
    this.playerSprites.set(sessionId, container);

    if (isSelf) {
      this.cameras.main.startFollow(container, true, 0.15, 0.15);
      this.updateHUD(player);
      this.updateQuestFromPlayerState(player);
      // Sync equipped weapon from initial state
      if (player.equippedWeaponId > 0) {
        this.equippedWeaponId = player.equippedWeaponId;
        const def = ITEM_DEFINITIONS[player.equippedWeaponId];
        this.updateEquippedWeaponHUD(def?.name ?? null, def?.damage ?? 0);
      }
    }
  }

  private updatePlayerSprite(sessionId: string, player: PlayerData) {
    const container = this.playerSprites.get(sessionId);
    if (!container) return;

    container.setData('targetX', player.x * TILE_SIZE + TILE_SIZE / 2);
    container.setData('targetY', player.y * TILE_SIZE + TILE_SIZE / 2);
    // Keep container visible for ghosts; fade only truly-dead (non-ghost) players
    container.setAlpha((player.dead && !player.ghost) ? 0.3 : 1);

    const hpBar = container.getData('hpBar') as Phaser.GameObjects.Graphics;
    if (hpBar) this.drawHpBar(hpBar, player.hp, player.hpMax);

    // Manage sprite/label references and ghost visuals
    let sprite = container.getData('sprite') as Phaser.GameObjects.Image | undefined;
    if (!sprite) {
      sprite = container.list.find((s) => s instanceof Phaser.GameObjects.Image) as Phaser.GameObjects.Image | undefined;
      if (sprite) container.setData('sprite', sprite);
    }

    let label = container.getData('label') as Phaser.GameObjects.Text | undefined;
    if (!label) {
      label = container.list.find((s) => s instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text | undefined;
      if (label) container.setData('label', label);
    }

    if (player.ghost) {
      if (sprite && sprite.texture.key !== 'player_ghost') sprite.setTexture('player_ghost');
      if (sprite) sprite.setAlpha(0.95);
      if (label) label.setColor('#dff8ff');

      let ghostTween = container.getData('ghostTween') as Phaser.Tweens.Tween | null;
      if (!ghostTween && sprite) {
        ghostTween = this.tweens.add({
          targets: sprite,
          y: { from: -6, to: -2 },
          duration: 900,
          ease: 'Sine.InOut',
          yoyo: true,
          repeat: -1,
        });
        container.setData('ghostTween', ghostTween);
      }
    } else {
      const ghostTween = container.getData('ghostTween') as Phaser.Tweens.Tween | undefined;
      if (ghostTween) {
        ghostTween.stop();
        ghostTween.remove();
        container.setData('ghostTween', null);
      }
      if (sprite) {
        sprite.y = 0;
        sprite.setAlpha(1);
        const isSelf = sessionId === this.mySessionId;
        const desiredKey = isSelf ? 'player_self' : 'player_other';
        if (sprite.texture.key !== desiredKey) sprite.setTexture(desiredKey);
      }
      if (label) label.setColor(sessionId === this.mySessionId ? '#88ccff' : '#ffcc66');
    }

    if (sessionId === this.mySessionId) {
      this.updateHUD(player);
      this.updateQuestFromPlayerState(player);
    }

    // If this is the local player, manage roof translucency for houses (show interior only when inside)
    if (sessionId === this.mySessionId) {
      for (const [id, h] of this.houseContainers.entries()) {
        const def = HOUSES.find((x) => x.id === id);
        if (!def) continue;
        const inside = player.x >= def.interiorMinX && player.x <= def.interiorMaxX && player.y >= def.interiorMinY && player.y <= def.interiorMaxY;
        h.roof.setAlpha(inside ? 0.25 : 1);
      }
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
    const texKey = `enemy_${enemy.enemyType}`;
    const sprite = this.add.image(0, 0, texKey);
    const label = this.add.text(0, -TILE_SIZE / 2 - 6, enemy.name, {
      fontSize: '10px', color: '#ff4444', align: 'center',
    }).setOrigin(0.5, 1);

    const hpBar = this.add.graphics();
    const container = this.add.container(
      enemy.x * TILE_SIZE + TILE_SIZE / 2,
      enemy.y * TILE_SIZE + TILE_SIZE / 2,
      [hpBar, sprite, label],
    );
    container.setDepth(5);
    container.setData('targetX', enemy.x * TILE_SIZE + TILE_SIZE / 2);
    container.setData('targetY', enemy.y * TILE_SIZE + TILE_SIZE / 2);
    container.setData('hpBar', hpBar);
    container.setData('enemyId', enemyId);

    this.drawHpBar(hpBar, enemy.hp, enemy.hpMax);
    this.enemySprites.set(enemyId, container);

    // Click to select enemy
    container.setSize(TILE_SIZE, TILE_SIZE);
    container.setInteractive();
    container.on('pointerdown', () => {
      this.selectedEnemyId = enemyId;
      this.updateTargetHUD(enemy);
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
      this.updateTargetHUD(enemy);
    }
  }

  private removeEnemySprite(enemyId: string) {
    const container = this.enemySprites.get(enemyId);
    if (container) {
      container.destroy();
      this.enemySprites.delete(enemyId);
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
    const yOff = -TILE_SIZE / 2 - 14;
    gfx.fillStyle(0x333333);
    gfx.fillRect(-w / 2, yOff, w, h);
    const ratio = Math.max(0, hp / (hpMax || 100));
    const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444;
    gfx.fillStyle(color);
    gfx.fillRect(-w / 2, yOff, w * ratio, h);
  }

  // ==================== HUD ====================

  private updateHUD(player: PlayerData) {
    this.hpText.setText(`HP: ${player.hp}/${player.hpMax}`);
    this.nameText.setText(`${player.name} — Nivel ${player.level} — ${player.characterClass}`);
    const xpNeeded = player.level * 100;
    this.statsText.setText(`XP: ${player.xp}/${xpNeeded}  |  Oro: ${player.gold}`);
  }

  private updateTargetHUD(enemy: EnemyData) {
    this.targetText.setText(`Objetivo: ${enemy.name} — HP: ${enemy.hp}/${enemy.hpMax}`);
  }

  private updateEquippedWeaponHUD(weaponName: string | null, damage: number) {
    if (weaponName) {
      this.equippedWeaponText.setText(`Arma: ${weaponName} (+${damage} dmg)`);
    } else {
      this.equippedWeaponText.setText('');
    }
  }

  private updateQuestFromPlayerState(player: PlayerData) {
    this.questProgress = {
      questId: 'slime_hunt_1',
      targetName: 'Slime',
      kills: player.questSlimeKills ?? 0,
      goal: QUEST_SLIME_REQUIRED_KILLS,
      completed: player.questSlimeCompleted ?? false,
      rewardGold: this.questProgress.rewardGold,
    };
    this.updateQuestHUD();
  }

  private updateQuestHUD() {
    if (this.questProgress.completed) {
      this.questText.setColor('#aaffaa');
      this.questText.setText('Mision: Slimes limpiados - completada');
      return;
    }

    const goal = this.questProgress.goal || QUEST_SLIME_REQUIRED_KILLS;
    this.questText.setColor('#99ddff');
    this.questText.setText(`Mision: matar slimes ${this.questProgress.kills}/${goal}`);
  }

  private handleNpcInteractInput() {
    if (!this.room) return;
    if (!Phaser.Input.Keyboard.JustDown(this.interactKey)) return;
    if (this.chatOverlay.isInputFocused()) return;

    const player = this.room.state.players.get(this.mySessionId) as PlayerData | undefined;
    if (!player) return;

    // Check doors first
    const nearbyDoorId = this.getNearbyDoorId(player);
    if (nearbyDoorId) {
      this.room.send(ClientMessage.ToggleDoor, {});
      return;
    }

    const nearbyNpcId = this.getNearbyNpcId(player);
    if (nearbyNpcId) {
      // Allow interaction with priest while dead/ghost; block other NPCs
      if (player.dead && nearbyNpcId !== PRIEST_NPC.id) {
        this.addChatMessage('Sistema', 'No puedes interactuar ahora.', 'system');
        return;
      }
      this.room.send(ClientMessage.NpcInteract, { npcId: nearbyNpcId });
      return;
    }

    if (this.isNearPortal(player)) {
      if (player.dead) {
        this.addChatMessage('Sistema', 'No puedes usar portales mientras estás muerto.', 'system');
        return;
      }
      this.room.send(ClientMessage.PortalUse, {});
      return;
    }

    this.addChatMessage('Sistema', 'No hay NPC ni portal cerca.', 'system');
  }

  private getNearbyNpcId(player: PlayerData): string | null {
    const candidates = [
      { id: QUEST_NPC.id, x: QUEST_NPC.x, y: QUEST_NPC.y },
      { id: MERCHANT_NPC.id, x: MERCHANT_NPC.x, y: MERCHANT_NPC.y },
      { id: PRIEST_NPC.id, x: PRIEST_NPC.x, y: PRIEST_NPC.y },
    ];

    let nearestId: string | null = null;
    let nearestDistance = Infinity;

    for (const npc of candidates) {
      const distance = Math.hypot(player.x - npc.x, player.y - npc.y);
      if (distance <= NPC_INTERACT_RANGE && distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = npc.id;
      }
    }

    return nearestId;
  }

  private getNearbyDoorId(player: PlayerData): string | null {
    for (const h of HOUSES) {
      const dist = Math.hypot(player.x - h.doorX, player.y - h.doorY);
      if (dist <= NPC_INTERACT_RANGE) return h.id;
    }
    return null;
  }

  private isNearPortal(player: PlayerData): boolean {
    return (
      Math.hypot(player.x - SAFE_PORTAL.x, player.y - SAFE_PORTAL.y) <= PORTAL_INTERACT_RANGE ||
      Math.hypot(player.x - DUNGEON_PORTAL.x, player.y - DUNGEON_PORTAL.y) <= PORTAL_INTERACT_RANGE
    );
  }

  // ==================== GAME LOOP ====================

  update(_time: number, delta: number) {
    if (!this.room) return;

    this.handleMovementInput(delta);
    this.handleAttackInput();
    this.handleNpcInteractInput();
    this.interpolateSprites(delta);
    this.chatOverlay.tick();
  }

  private handleMovementInput(delta: number) {
    if (this.chatOverlay.isInputFocused()) return;

    const player = this.room?.state?.players?.get(this.mySessionId) as PlayerData | undefined;
    if (!player || (player.dead && !player.ghost)) return;

    let dx = 0;
    let dy = 0;
    let direction = player.direction;

    if (this.cursors.left.isDown) { dx = -1; direction = 'left'; }
    else if (this.cursors.right.isDown) { dx = 1; direction = 'right'; }
    if (this.cursors.up.isDown) { dy = -1; direction = 'up'; }
    else if (this.cursors.down.isDown) { dy = 1; direction = 'down'; }

    if (dx === 0 && dy === 0) return;

    const speed = PLAYER_SPEED * (delta / 1000);
    const targetX = Math.max(0, Math.min(MAP_WIDTH - 1, player.x + dx * speed));
    const targetY = Math.max(0, Math.min(MAP_HEIGHT - 1, player.y + dy * speed));

    // Sliding collision: try full move, then X-only, then Y-only
    let newX: number;
    let newY: number;

    if (!isSolid(targetX, targetY)) {
      newX = targetX;
      newY = targetY;
    } else if (dx !== 0 && !isSolid(targetX, player.y)) {
      newX = targetX;
      newY = player.y;
    } else if (dy !== 0 && !isSolid(player.x, targetY)) {
      newX = player.x;
      newY = targetY;
    } else {
      return; // fully blocked
    }

    const threshold = 0.05;
    if (Math.abs(newX - this.lastSentX) > threshold || Math.abs(newY - this.lastSentY) > threshold) {
      this.room.send(ClientMessage.Move, { x: newX, y: newY, direction });
      this.lastSentX = newX;
      this.lastSentY = newY;
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
    const lerpFactor = Math.min(1, delta / 50);

    this.playerSprites.forEach((container) => {
      const tx = container.getData('targetX') as number;
      const ty = container.getData('targetY') as number;
      container.x += (tx - container.x) * lerpFactor;
      container.y += (ty - container.y) * lerpFactor;
    });

    this.enemySprites.forEach((container) => {
      const tx = container.getData('targetX') as number;
      const ty = container.getData('targetY') as number;
      container.x += (tx - container.x) * lerpFactor;
      container.y += (ty - container.y) * lerpFactor;
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
