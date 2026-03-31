// Shared constants

export const TICK_RATE = 20; // server ticks per second
export const TILE_SIZE = 32;
export const MAP_WIDTH = 72; // tiles
export const MAP_HEIGHT = 28; // tiles
export const PLAYER_SPEED = 8; // tiles per second
export const MAX_PLAYERS_PER_ROOM = 50;
export const MAX_CHAT_LENGTH = 200;

// --- Combat ---
export const ATTACK_RANGE = 1.5; // tiles
export const ATTACK_COOLDOWN_MS = 1000;
export const RESPAWN_TIME_MS = 5000;
export const XP_PER_LEVEL = 100; // xp needed = level * XP_PER_LEVEL
export const HP_PER_LEVEL = 20;
export const BASE_PLAYER_DAMAGE = 10;

// --- Enemies ---
export interface EnemyTemplate {
  type: string;
  name: string;
  hp: number;
  damage: number;
  speed: number; // tiles/sec
  aggroRange: number; // tiles
  xpReward: number;
  goldReward: [number, number]; // [min, max]
}

export const ENEMY_TEMPLATES: Record<string, EnemyTemplate> = {
  slime: { type: 'slime', name: 'Slime', hp: 30, damage: 5, speed: 0.8, aggroRange: 4, xpReward: 15, goldReward: [1, 5] },
  wolf: { type: 'wolf', name: 'Lobo', hp: 60, damage: 12, speed: 1.5, aggroRange: 5, xpReward: 30, goldReward: [3, 10] },
  skeleton: { type: 'skeleton', name: 'Esqueleto', hp: 80, damage: 18, speed: 1.0, aggroRange: 6, xpReward: 50, goldReward: [5, 20] },
};

export const MAX_ENEMIES = 10;
export const ENEMY_SPAWN_INTERVAL_MS = 8000;

// Safe spawn position for new characters (tile coords, must be walkable)
export const SAFE_SPAWN_X = 5;
export const SAFE_SPAWN_Y = 10;
// Enemies may not move west of this tile column (0-indexed)
export const SAFE_ZONE_MAX_X = 15;

// --- First quest (NPC tutorial) ---
export const QUEST_SLIME_REQUIRED_KILLS = 5;
export const QUEST_SLIME_REWARD_GOLD = 75;
export const NPC_INTERACT_RANGE = 1.8;

export interface NpcDefinition {
  id: string;
  name: string;
  x: number;
  y: number;
}

export const QUEST_NPC: NpcDefinition = {
  id: 'npc_tutor',
  name: 'Instructor Bram',
  x: 7,
  y: 10,
};

export const MERCHANT_NPC: NpcDefinition = {
  id: 'npc_merchant',
  name: 'Mercader Orin',
  x: 9,
  y: 10,
};

export const PRIEST_NPC: NpcDefinition = {
  id: 'npc_priest',
  name: 'Sacerdote Lys',
  x: 6,
  y: 10,
};

export interface HouseDefinition {
  id: string;
  x: number; // top-left tile x
  y: number; // top-left tile y
  width: number; // tiles
  height: number; // tiles
  doorX: number; // door tile x
  doorY: number; // door tile y
  interiorMinX: number;
  interiorMaxX: number;
  interiorMinY: number;
  interiorMaxY: number;
}

export const HOUSES: HouseDefinition[] = [
  // Small house near the camp (example)
  {
    id: 'house_1',
    x: 5,
    y: 6,
    width: 4,
    height: 4,
    doorX: 6,
    doorY: 9,
    interiorMinX: 6,
    interiorMaxX: 7,
    interiorMinY: 7,
    interiorMaxY: 8,
  },
];

export const MERCHANT_HEALTH_POTION_ITEM_ID = 1;
export const MERCHANT_HEALTH_POTION_PRICE = 20;

export interface TilePosition {
  x: number;
  y: number;
}

export interface RectZone {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// Dungeon-like chamber rendered with a different ground tile.
// The chamber is enclosed by walls and accessed only through portals.
export const DUNGEON_FLOOR_ZONE: RectZone = {
  minX: 24,
  maxX: 27,
  minY: 3,
  maxY: 6,
};

// Walkable biome to the far east of the world.
export const DESERT_BIOME_ZONE: RectZone = {
  minX: 44,
  maxX: MAP_WIDTH - 2,
  minY: 2,
  maxY: MAP_HEIGHT - 3,
};

export const SAFE_PORTAL: TilePosition = { x: 12, y: 10 };
export const DUNGEON_PORTAL: TilePosition = { x: 26, y: 4 };
export const PORTAL_INTERACT_RANGE = 1.3;

// ---------------------------------------------------------------------------
// Items — matches rows seeded in item_templates table
// ---------------------------------------------------------------------------
export const MAX_INVENTORY_SLOTS = 20;

export interface ItemDefinition {
  id: number;           // DB primary key (must match init.sql seed)
  name: string;
  type: 'consumable' | 'weapon' | 'armor' | 'misc';
  stackable: boolean;
  maxStack: number;
  sellValue: number;
  /** Damage bonus when equipped (weapons only) */
  damage?: number;
  /** Effect applied on use (consumables only) */
  useEffect?: { hpRestore?: number };
}

export const ITEM_DEFINITIONS: Record<number, ItemDefinition> = {
  1: { id: 1, name: 'Poción de vida',    type: 'consumable', stackable: true,  maxStack: 99, sellValue: 10,  useEffect: { hpRestore: 50 } },
  2: { id: 2, name: 'Poción mayor',      type: 'consumable', stackable: true,  maxStack: 99, sellValue: 25,  useEffect: { hpRestore: 150 } },
  3: { id: 3, name: 'Espada corta',      type: 'weapon',     stackable: false, maxStack: 1,  sellValue: 50,  damage: 15 },
  4: { id: 4, name: 'Daga',              type: 'weapon',     stackable: false, maxStack: 1,  sellValue: 30,  damage: 10 },
  5: { id: 5, name: 'Hueso de lobo',     type: 'misc',       stackable: true,  maxStack: 50, sellValue: 5   },
  6: { id: 6, name: 'Fragmento',         type: 'misc',       stackable: true,  maxStack: 50, sellValue: 3   },
};

/** Drop table per enemy type: array of { itemId, chance 0-1, quantity [min, max] } */
export interface LootEntry {
  itemId: number;
  chance: number;
  quantity: [number, number];
}

export const ENEMY_LOOT_TABLES: Record<string, LootEntry[]> = {
  slime:    [{ itemId: 1, chance: 0.4, quantity: [1, 1] },
             { itemId: 6, chance: 0.6, quantity: [1, 3] }],
  wolf:     [{ itemId: 1, chance: 0.5, quantity: [1, 2] },
             { itemId: 5, chance: 0.7, quantity: [1, 2] },
             { itemId: 4, chance: 0.1, quantity: [1, 1] }],
  skeleton: [{ itemId: 2, chance: 0.3, quantity: [1, 1] },
             { itemId: 3, chance: 0.15, quantity: [1, 1] },
             { itemId: 6, chance: 0.8, quantity: [1, 4] }],
};

function setRectWalls(
  layout: number[][],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
) {
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) continue;
      layout[y][x] = 1;
    }
  }
}

function carveRect(
  layout: number[][],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
) {
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) continue;
      layout[y][x] = 0;
    }
  }
}

function ensureWalkable(layout: number[][], x: number, y: number) {
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return;
  layout[y][x] = 0;
}

function createMapLayout(): number[][] {
  const layout = Array.from({ length: MAP_HEIGHT }, () => Array<number>(MAP_WIDTH).fill(0));

  // Border walls
  setRectWalls(layout, 0, MAP_WIDTH - 1, 0, 0);
  setRectWalls(layout, 0, MAP_WIDTH - 1, MAP_HEIGHT - 1, MAP_HEIGHT - 1);
  setRectWalls(layout, 0, 0, 0, MAP_HEIGHT - 1);
  setRectWalls(layout, MAP_WIDTH - 1, MAP_WIDTH - 1, 0, MAP_HEIGHT - 1);

  // Legacy camp/safe-zone structures (left side)
  setRectWalls(layout, 3, 4, 3, 4);
  setRectWalls(layout, 6, 6, 7, 9);
  setRectWalls(layout, 11, 12, 3, 3);
  setRectWalls(layout, 11, 11, 4, 5);
  setRectWalls(layout, 11, 12, 15, 16);

  // Combat ruins across central map
  setRectWalls(layout, 20, 22, 6, 8);
  setRectWalls(layout, 26, 29, 11, 12);
  setRectWalls(layout, 33, 35, 4, 6);
  setRectWalls(layout, 36, 38, 14, 17);

  // Dungeon chamber ring (portal destination)
  setRectWalls(
    layout,
    DUNGEON_FLOOR_ZONE.minX - 1,
    DUNGEON_FLOOR_ZONE.maxX + 1,
    DUNGEON_FLOOR_ZONE.minY - 1,
    DUNGEON_FLOOR_ZONE.maxY + 1,
  );
  carveRect(
    layout,
    DUNGEON_FLOOR_ZONE.minX,
    DUNGEON_FLOOR_ZONE.maxX,
    DUNGEON_FLOOR_ZONE.minY,
    DUNGEON_FLOOR_ZONE.maxY,
  );

  // Desert rocks / dunes (far east biome)
  setRectWalls(layout, 47, 48, 5, 7);
  setRectWalls(layout, 53, 55, 10, 11);
  setRectWalls(layout, 60, 62, 16, 18);
  setRectWalls(layout, 66, 67, 7, 9);
  setRectWalls(layout, 57, 58, 21, 23);

  // Keep critical gameplay tiles always reachable
  ensureWalkable(layout, SAFE_SPAWN_X, SAFE_SPAWN_Y);
  ensureWalkable(layout, QUEST_NPC.x, QUEST_NPC.y);
  ensureWalkable(layout, MERCHANT_NPC.x, MERCHANT_NPC.y);
  ensureWalkable(layout, PRIEST_NPC.x, PRIEST_NPC.y);
  ensureWalkable(layout, SAFE_PORTAL.x, SAFE_PORTAL.y);
  ensureWalkable(layout, DUNGEON_PORTAL.x, DUNGEON_PORTAL.y);

  return layout;
}

// ---------------------------------------------------------------------------
// Map layout — 0 = walkable, 1 = solid wall/obstacle
// Dimensions must match MAP_WIDTH x MAP_HEIGHT.
// Row 0 = top, column 0 = left.
// ---------------------------------------------------------------------------
export const MAP_LAYOUT: readonly (readonly number[])[] = createMapLayout();
