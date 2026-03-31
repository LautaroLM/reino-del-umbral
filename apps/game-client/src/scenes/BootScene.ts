import Phaser from 'phaser';
import { TILE_SIZE } from '@ao/shared-constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Generate a compact runtime tileset used by the world tilemap.
    // Tile order: 0 safe grass, 1 combat grass, 2 wall, 3 dungeon floor, 4 desert.
    const worldTilesGfx = this.add.graphics();

    // Safe grass tile
    worldTilesGfx.fillStyle(0x5aad60);
    worldTilesGfx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    worldTilesGfx.lineStyle(1, 0x47984c, 0.6);
    worldTilesGfx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
    worldTilesGfx.fillStyle(0xffe066, 0.5);
    worldTilesGfx.fillCircle(8, 8, 2);
    worldTilesGfx.fillStyle(0xff9999, 0.4);
    worldTilesGfx.fillCircle(24, 20, 2);

    // Combat grass tile
    const combatTileX = TILE_SIZE;
    worldTilesGfx.fillStyle(0x3a7d44);
    worldTilesGfx.fillRect(combatTileX, 0, TILE_SIZE, TILE_SIZE);
    worldTilesGfx.lineStyle(1, 0x2d6a37);
    worldTilesGfx.strokeRect(combatTileX, 0, TILE_SIZE, TILE_SIZE);

    // Wall tile
    const wallTileX = TILE_SIZE * 2;
    worldTilesGfx.fillStyle(0x555566);
    worldTilesGfx.fillRect(wallTileX, 0, TILE_SIZE, TILE_SIZE);
    worldTilesGfx.lineStyle(1, 0x333344);
    worldTilesGfx.strokeRect(wallTileX + 1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
    worldTilesGfx.lineStyle(1, 0x444455, 0.6);
    worldTilesGfx.lineBetween(wallTileX, TILE_SIZE / 2, wallTileX + TILE_SIZE, TILE_SIZE / 2);
    worldTilesGfx.lineBetween(wallTileX + TILE_SIZE / 2, 0, wallTileX + TILE_SIZE / 2, TILE_SIZE / 2);

    // Dungeon floor tile
    const dungeonTileX = TILE_SIZE * 3;
    worldTilesGfx.fillStyle(0x2e2a42);
    worldTilesGfx.fillRect(dungeonTileX, 0, TILE_SIZE, TILE_SIZE);
    worldTilesGfx.lineStyle(1, 0x231f33);
    worldTilesGfx.strokeRect(dungeonTileX, 0, TILE_SIZE, TILE_SIZE);
    worldTilesGfx.lineStyle(1, 0x4c4568, 0.5);
    worldTilesGfx.lineBetween(dungeonTileX + 6, 6, dungeonTileX + 26, 26);
    worldTilesGfx.lineBetween(dungeonTileX + 26, 6, dungeonTileX + 6, 26);

    // Desert tile
    const desertTileX = TILE_SIZE * 4;
    worldTilesGfx.fillStyle(0xc79a5c);
    worldTilesGfx.fillRect(desertTileX, 0, TILE_SIZE, TILE_SIZE);
    worldTilesGfx.lineStyle(1, 0xb28244, 0.9);
    worldTilesGfx.strokeRect(desertTileX, 0, TILE_SIZE, TILE_SIZE);
    worldTilesGfx.lineStyle(1, 0xd9b27b, 0.5);
    worldTilesGfx.lineBetween(desertTileX + 4, 10, desertTileX + 28, 12);
    worldTilesGfx.lineBetween(desertTileX + 6, 22, desertTileX + 26, 20);

    worldTilesGfx.generateTexture('world_tiles', TILE_SIZE * 5, TILE_SIZE);
    worldTilesGfx.destroy();

    // Generate combat zone grass tile (normal green)
    const tileGfx = this.add.graphics();
    tileGfx.fillStyle(0x3a7d44);
    tileGfx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    tileGfx.lineStyle(1, 0x2d6a37);
    tileGfx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
    tileGfx.generateTexture('tile_grass', TILE_SIZE, TILE_SIZE);
    tileGfx.destroy();

    // Safe zone grass tile (lighter, peaceful green)
    const safeGfx = this.add.graphics();
    safeGfx.fillStyle(0x5aad60);
    safeGfx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    safeGfx.lineStyle(1, 0x47984c, 0.6);
    safeGfx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
    // subtle flower dots
    safeGfx.fillStyle(0xffe066, 0.5);
    safeGfx.fillCircle(8, 8, 2);
    safeGfx.fillStyle(0xff9999, 0.4);
    safeGfx.fillCircle(24, 20, 2);
    safeGfx.generateTexture('tile_grass_safe', TILE_SIZE, TILE_SIZE);
    safeGfx.destroy();

    // ── Player (self) — Blue knight ──────────────────────────────────
    const playerGfx = this.add.graphics();
    // Shadow
    playerGfx.fillStyle(0x000000, 0.2);
    playerGfx.fillEllipse(16, 29, 20, 5);
    // Boots
    playerGfx.fillStyle(0x1a1a2e);
    playerGfx.fillRect(10, 23, 5, 7);
    playerGfx.fillRect(17, 23, 5, 7);
    // Body / cloak
    playerGfx.fillStyle(0x1e3a6e);
    playerGfx.fillRoundedRect(7, 13, 18, 12, 3);
    // Chest plate
    playerGfx.fillStyle(0x2e5a9f);
    playerGfx.fillRoundedRect(9, 13, 14, 7, 2);
    // Belt
    playerGfx.fillStyle(0xb8860b);
    playerGfx.fillRect(7, 23, 18, 2);
    // Sword blade
    playerGfx.fillStyle(0xb0b8c8);
    playerGfx.fillRect(24, 12, 2, 11);
    // Crossguard
    playerGfx.fillStyle(0xb8860b);
    playerGfx.fillRect(22, 17, 6, 2);
    // Handle
    playerGfx.fillStyle(0x5c3a1e);
    playerGfx.fillRect(24, 19, 2, 5);
    // Neck (skin)
    playerGfx.fillStyle(0xf4a460);
    playerGfx.fillRect(14, 11, 4, 5);
    // Head (skin)
    playerGfx.fillStyle(0xf4a460);
    playerGfx.fillCircle(16, 9, 7);
    // Helmet
    playerGfx.fillStyle(0x2255aa);
    playerGfx.fillRoundedRect(9, 3, 14, 8, 3);
    // Helmet top accent
    playerGfx.fillStyle(0x4477dd);
    playerGfx.fillRect(9, 3, 14, 2);
    // Visor slit
    playerGfx.fillStyle(0x08081a);
    playerGfx.fillRect(10, 9, 12, 2);
    // Visor shine
    playerGfx.fillStyle(0x88aaff, 0.5);
    playerGfx.fillRect(11, 4, 4, 2);
    playerGfx.generateTexture('player_self', TILE_SIZE, TILE_SIZE);
    playerGfx.destroy();

    // ── Other players — Dark red ranger ──────────────────────────────
    const otherGfx = this.add.graphics();
    // Shadow
    otherGfx.fillStyle(0x000000, 0.2);
    otherGfx.fillEllipse(16, 29, 20, 5);
    // Boots
    otherGfx.fillStyle(0x2a1a0e);
    otherGfx.fillRect(10, 23, 5, 7);
    otherGfx.fillRect(17, 23, 5, 7);
    // Body
    otherGfx.fillStyle(0x6e2a1e);
    otherGfx.fillRoundedRect(7, 13, 18, 12, 3);
    // Chest
    otherGfx.fillStyle(0x9f3a28);
    otherGfx.fillRoundedRect(9, 13, 14, 7, 2);
    // Belt
    otherGfx.fillStyle(0x7a5c14);
    otherGfx.fillRect(7, 23, 18, 2);
    // Neck
    otherGfx.fillStyle(0xf4a460);
    otherGfx.fillRect(14, 11, 4, 5);
    // Head
    otherGfx.fillStyle(0xf4a460);
    otherGfx.fillCircle(16, 9, 7);
    // Leather cap
    otherGfx.fillStyle(0x5c3010);
    otherGfx.fillRoundedRect(9, 3, 14, 8, 3);
    // Cap accent
    otherGfx.fillStyle(0x7a4520);
    otherGfx.fillRect(9, 3, 14, 2);
    // Cap visor slit
    otherGfx.fillStyle(0x080808);
    otherGfx.fillRect(10, 9, 12, 2);
    otherGfx.generateTexture('player_other', TILE_SIZE, TILE_SIZE);
    otherGfx.destroy();

    // ── Player: Ghost (little floating sheet) ─────────────────────────────
    const ghostGfx = this.add.graphics();
    // Soft halo
    ghostGfx.fillStyle(0xcffaff, 0.28);
    ghostGfx.fillEllipse(16, 12, 22, 18);
    // Main ghost body (sheet-like)
    ghostGfx.fillStyle(0xffffff, 0.92);
    ghostGfx.fillEllipse(16, 9, 16, 14);
    // Scalloped bottom
    ghostGfx.fillStyle(0xffffff, 0.92);
    ghostGfx.fillCircle(10, 20, 4);
    ghostGfx.fillCircle(16, 22, 4);
    ghostGfx.fillCircle(22, 20, 4);
    // Eyes and small mouth
    ghostGfx.fillStyle(0x111111, 0.85);
    ghostGfx.fillCircle(13, 9, 1.8);
    ghostGfx.fillCircle(19, 9, 1.8);
    ghostGfx.fillStyle(0x111111, 0.6);
    ghostGfx.fillRect(14, 13, 4, 1);
    ghostGfx.generateTexture('player_ghost', TILE_SIZE, TILE_SIZE);
    ghostGfx.destroy();

    // ── NPC: Quest giver (Instructor) ───────────────────────────────
    const npcGfx = this.add.graphics();
    // Shadow
    npcGfx.fillStyle(0x000000, 0.2);
    npcGfx.fillEllipse(16, 29, 20, 5);
    // Robe
    npcGfx.fillStyle(0x5a3d8a);
    npcGfx.fillRoundedRect(7, 13, 18, 14, 3);
    // Robe trim
    npcGfx.fillStyle(0xd8c074);
    npcGfx.fillRect(15, 13, 2, 14);
    // Staff
    npcGfx.fillStyle(0x6e4b2a);
    npcGfx.fillRect(24, 8, 2, 18);
    npcGfx.fillStyle(0x99ddff);
    npcGfx.fillCircle(25, 7, 3);
    // Head
    npcGfx.fillStyle(0xe0b080);
    npcGfx.fillCircle(16, 9, 7);
    // Hood
    npcGfx.fillStyle(0x3c255f);
    npcGfx.fillRoundedRect(9, 3, 14, 8, 3);
    npcGfx.generateTexture('npc_questgiver', TILE_SIZE, TILE_SIZE);
    npcGfx.destroy();

    // ── Enemy: Slime ──────────────────────────────────────────────────
    const slimeGfx = this.add.graphics();
    // Shadow
    slimeGfx.fillStyle(0x000000, 0.18);
    slimeGfx.fillEllipse(16, 29, 22, 5);
    // Main blob body
    slimeGfx.fillStyle(0x22bb44);
    slimeGfx.fillCircle(16, 18, 12);
    // Blob top bumps
    slimeGfx.fillStyle(0x33cc55);
    slimeGfx.fillCircle(11, 12, 5);
    slimeGfx.fillCircle(21, 12, 5);
    slimeGfx.fillCircle(16, 8, 5);
    // Dark drip base
    slimeGfx.fillStyle(0x15882e);
    slimeGfx.fillEllipse(16, 27, 18, 6);
    // Highlight spot
    slimeGfx.fillStyle(0x99ffbb, 0.5);
    slimeGfx.fillCircle(11, 13, 3);
    // White eyes
    slimeGfx.fillStyle(0xffffff);
    slimeGfx.fillCircle(12, 18, 3);
    slimeGfx.fillCircle(20, 18, 3);
    // Pupils
    slimeGfx.fillStyle(0x112200);
    slimeGfx.fillCircle(13, 18, 2);
    slimeGfx.fillCircle(21, 18, 2);
    // Eye shine
    slimeGfx.fillStyle(0xffffff);
    slimeGfx.fillRect(12, 17, 1, 1);
    slimeGfx.fillRect(20, 17, 1, 1);
    slimeGfx.generateTexture('enemy_slime', TILE_SIZE, TILE_SIZE);
    slimeGfx.destroy();

    // ── Enemy: Wolf ───────────────────────────────────────────────────
    const wolfGfx = this.add.graphics();
    // Shadow
    wolfGfx.fillStyle(0x000000, 0.18);
    wolfGfx.fillEllipse(16, 30, 24, 5);
    // Body (elongated)
    wolfGfx.fillStyle(0x787888);
    wolfGfx.fillEllipse(16, 22, 22, 14);
    // Head
    wolfGfx.fillStyle(0x888898);
    wolfGfx.fillCircle(16, 11, 9);
    // Snout
    wolfGfx.fillStyle(0x9e9e8e);
    wolfGfx.fillEllipse(16, 14, 10, 7);
    // Ears outer
    wolfGfx.fillStyle(0x787888);
    wolfGfx.fillTriangle(9, 8, 6, 1, 13, 5);
    wolfGfx.fillTriangle(23, 8, 19, 5, 26, 1);
    // Ears inner (pink)
    wolfGfx.fillStyle(0xdd9999);
    wolfGfx.fillTriangle(10, 7, 7, 2, 13, 5);
    wolfGfx.fillTriangle(22, 7, 19, 5, 25, 2);
    // Eyes (amber)
    wolfGfx.fillStyle(0xddaa00);
    wolfGfx.fillCircle(12, 10, 2);
    wolfGfx.fillCircle(20, 10, 2);
    // Pupils
    wolfGfx.fillStyle(0x000000);
    wolfGfx.fillCircle(12, 10, 1);
    wolfGfx.fillCircle(20, 10, 1);
    // Nose
    wolfGfx.fillStyle(0x1a1a1a);
    wolfGfx.fillEllipse(16, 16, 5, 3);
    wolfGfx.generateTexture('enemy_wolf', TILE_SIZE, TILE_SIZE);
    wolfGfx.destroy();

    // ── Enemy: Skeleton ───────────────────────────────────────────────
    const skelGfx = this.add.graphics();
    // Shadow
    skelGfx.fillStyle(0x000000, 0.18);
    skelGfx.fillEllipse(16, 29, 18, 5);
    // Ribcage body
    skelGfx.fillStyle(0xd4c9a8);
    skelGfx.fillRoundedRect(10, 16, 12, 12, 2);
    // Rib lines
    skelGfx.fillStyle(0xa89878);
    for (let rib = 0; rib < 4; rib++) {
      skelGfx.fillRect(10, 17 + rib * 3, 12, 1);
    }
    // Neck
    skelGfx.fillStyle(0xd4c9a8);
    skelGfx.fillRect(14, 13, 4, 5);
    // Skull
    skelGfx.fillStyle(0xe8dfc0);
    skelGfx.fillCircle(16, 8, 8);
    // Jaw
    skelGfx.fillStyle(0xd4c9a8);
    skelGfx.fillRoundedRect(11, 13, 10, 4, 1);
    // Teeth
    skelGfx.fillStyle(0xffffff);
    skelGfx.fillRect(12, 14, 2, 2);
    skelGfx.fillRect(15, 14, 2, 2);
    skelGfx.fillRect(18, 14, 2, 2);
    // Tooth gaps
    skelGfx.fillStyle(0x333322);
    skelGfx.fillRect(14, 14, 1, 2);
    skelGfx.fillRect(17, 14, 1, 2);
    skelGfx.fillRect(20, 14, 1, 2);
    // Eye sockets (dark)
    skelGfx.fillStyle(0x222211);
    skelGfx.fillCircle(12, 8, 3);
    skelGfx.fillCircle(20, 8, 3);
    // Red eye glow
    skelGfx.fillStyle(0xff2200);
    skelGfx.fillCircle(12, 8, 1);
    skelGfx.fillCircle(20, 8, 1);
    // Skull crack
    skelGfx.fillStyle(0xb0a080, 0.8);
    skelGfx.fillRect(16, 2, 1, 5);
    skelGfx.generateTexture('enemy_skeleton', TILE_SIZE, TILE_SIZE);
    skelGfx.destroy();

    // Wall tile texture (stone)
    const wallGfx = this.add.graphics();
    wallGfx.fillStyle(0x555566);
    wallGfx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    wallGfx.lineStyle(1, 0x333344);
    wallGfx.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
    // stone bricks detail
    wallGfx.lineStyle(1, 0x444455, 0.6);
    wallGfx.lineBetween(0, TILE_SIZE / 2, TILE_SIZE, TILE_SIZE / 2);
    wallGfx.lineBetween(TILE_SIZE / 2, 0, TILE_SIZE / 2, TILE_SIZE / 2);
    wallGfx.generateTexture('tile_wall', TILE_SIZE, TILE_SIZE);
    wallGfx.destroy();

    // Portal texture
    const portalGfx = this.add.graphics();
    portalGfx.fillStyle(0x3f1f7a, 0.8);
    portalGfx.fillCircle(TILE_SIZE / 2, TILE_SIZE / 2, 12);
    portalGfx.lineStyle(2, 0x9b7bff, 0.9);
    portalGfx.strokeCircle(TILE_SIZE / 2, TILE_SIZE / 2, 12);
    portalGfx.lineStyle(2, 0xd6c7ff, 0.9);
    portalGfx.strokeCircle(TILE_SIZE / 2, TILE_SIZE / 2, 8);
    portalGfx.fillStyle(0xd6c7ff, 0.8);
    portalGfx.fillCircle(TILE_SIZE / 2, TILE_SIZE / 2, 3);
    portalGfx.generateTexture('portal_rune', TILE_SIZE, TILE_SIZE);
    portalGfx.destroy();

    // ── House tiles / door ─────────────────────────────────────────────
    const houseWallGfx = this.add.graphics();
    houseWallGfx.fillStyle(0x8b5a3c);
    houseWallGfx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    houseWallGfx.lineStyle(1, 0x6a3f2a);
    houseWallGfx.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
    houseWallGfx.generateTexture('house_wall', TILE_SIZE, TILE_SIZE);
    houseWallGfx.destroy();

    const houseRoofGfx = this.add.graphics();
    houseRoofGfx.fillStyle(0x4a2b6f);
    houseRoofGfx.fillRect(0, 0, TILE_SIZE * 2, TILE_SIZE * 2);
    houseRoofGfx.lineStyle(2, 0x6f49a0);
    houseRoofGfx.strokeRect(0, 0, TILE_SIZE * 2, TILE_SIZE * 2);
    houseRoofGfx.generateTexture('house_roof', TILE_SIZE * 2, TILE_SIZE * 2);
    houseRoofGfx.destroy();

    const doorClosedGfx = this.add.graphics();
    doorClosedGfx.fillStyle(0x3a2b1f);
    doorClosedGfx.fillRect(8, 8, 16, 20);
    doorClosedGfx.lineStyle(1, 0x5a3f2a);
    doorClosedGfx.strokeRect(8, 8, 16, 20);
    doorClosedGfx.generateTexture('door_closed', TILE_SIZE, TILE_SIZE);
    doorClosedGfx.destroy();

    const doorOpenGfx = this.add.graphics();
    doorOpenGfx.fillStyle(0x3a2b1f, 0.6);
    doorOpenGfx.fillRect(8, 8, 6, 20);
    doorOpenGfx.fillRect(18, 8, 6, 20);
    doorOpenGfx.generateTexture('door_open', TILE_SIZE, TILE_SIZE);
    doorOpenGfx.destroy();

    const interiorGfx = this.add.graphics();
    interiorGfx.fillStyle(0xcfb585);
    interiorGfx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    interiorGfx.lineStyle(1, 0xb89a66, 0.6);
    interiorGfx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
    interiorGfx.generateTexture('interior_floor', TILE_SIZE, TILE_SIZE);
    interiorGfx.destroy();

    // Loading bar
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    this.add.text(w / 2, h / 2, 'Cargando...', { fontSize: '20px', color: '#fff' }).setOrigin(0.5);
  }

  create() {
    this.scene.start('GameScene');
  }
}
