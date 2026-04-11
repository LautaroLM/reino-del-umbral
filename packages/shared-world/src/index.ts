// ──────────────────────────────────────────────────────────────────────────────
// @ao/shared-world — Normalized world contract for Reino del Umbral
//
// These types represent the **imported** format used at runtime by both client
// and server.  They are produced by the importer scripts that read the legacy
// Argentum Online Web data files and output clean JSON.
// ──────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Map tiles
// ---------------------------------------------------------------------------

/** Graphic layers for a single tile (indices reference the AO grh catalogue). */
export interface TileGraphics {
  /** Layer 1 – ground */
  ground?: number;
  /** Layer 2 – roof / wall overlay */
  roof?: number;
  /** Layer 3 – objects under character (trees, fences, etc.) */
  decoration?: number;
  /** Layer 4 – translucent roof effect */
  roofEffect?: number;
}

/** A world object sitting on a tile. */
export interface TileObject {
  objIndex: number;
  amount: number;
}

/** Portal / teleport target on a tile. */
export interface TileExit {
  map: number;
  x: number;
  y: number;
}

/** A single tile within a map (row-major, 0-indexed). */
export interface TileData {
  blocked: boolean;
  graphics: TileGraphics;
  objInfo?: TileObject;
  tileExit?: TileExit;
  trigger?: number;
}

// ---------------------------------------------------------------------------
// Map metadata (from legacy dats/*.json)
// ---------------------------------------------------------------------------

export type Terreno = 'BOSQUE' | 'DESIERTO' | 'NIEVE' | 'DUNGEON' | 'CAMPO' | string;
export type Zona = 'CIUDAD' | 'CAMPO' | 'DUNGEON' | string;

export interface MapMetadata {
  name: string;
  musicNum: number;
  magiaSinEfecto: boolean;
  noEncriptarMp: boolean;
  terreno: Terreno;
  zona: Zona;
  restringir: string;
  backup: boolean;
  pk: boolean;
}

// ---------------------------------------------------------------------------
// Full map definition (output of the importer)
// ---------------------------------------------------------------------------

/** Width and height of every AO map (constant). */
export const AO_MAP_SIZE = 100;

export interface MapDefinition {
  mapId: number;
  width: number;   // always 100
  height: number;  // always 100
  metadata: MapMetadata;
  /** Row-major 2D array: tiles[y][x], 0-indexed. */
  tiles: TileData[][];
}

// ---------------------------------------------------------------------------
// NPC templates
// ---------------------------------------------------------------------------

export enum NpcType {
  HostileMob = 0,
  Priest = 1,
  Merchant = 2,
  Banker = 3,
  QuestGiver = 4,
  Guard = 5,
  Trainer = 6,
  Fisher = 7,
  Miner = 8,
  Lumberjack = 9,
  Crafter = 10,
  Noble = 11,
}

export interface NpcDropEntry {
  objIndex: number;
  chance: number;
}

export interface NpcTemplate {
  npcIndex: number;
  name: string;
  npcType: NpcType;
  idHead: number;
  idBody: number;
  movement: number;
  aguaValida: boolean;
  exp: number;
  hp: number;
  maxHp: number;
  maxHit: number;
  minHit: number;
  def: number;
  poderAtaque: number;
  poderEvasion: number;
  drop: NpcDropEntry[];
}

/** Where an NPC instance spawns on the world map. */
export interface NpcPlacement {
  mapNum: number;
  x: number;
  y: number;
  npcIndex: number;
}

// ---------------------------------------------------------------------------
// Object (item) templates
// ---------------------------------------------------------------------------

export interface ObjTemplate {
  objIndex: number;
  name: string;
  objType: number;
  grhIndex: number;
  anim: boolean;
}

// ---------------------------------------------------------------------------
// Graphic catalogue (from graficos.json)
// ---------------------------------------------------------------------------

export interface GrhFrame {
  grhIndex: number;
  numFile: string;
  sX: number;
  sY: number;
  width: number;
  height: number;
}

export interface GrhAnimation {
  grhIndex: number;
  numFrames: number;
  frames: number[];
  speed: number;
}

export type GrhEntry = GrhFrame | GrhAnimation;

export function isGrhAnimation(entry: GrhEntry): entry is GrhAnimation {
  return 'numFrames' in entry && (entry as GrhAnimation).numFrames > 1;
}

// ---------------------------------------------------------------------------
// World bundle — the full import artefact loaded at runtime
// ---------------------------------------------------------------------------

export interface WorldBundle {
  maps: Record<number, MapDefinition>;
  npcTemplates: Record<number, NpcTemplate>;
  npcPlacements: NpcPlacement[];
  objTemplates: Record<number, ObjTemplate>;
}
