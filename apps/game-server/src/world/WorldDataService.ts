import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MapDefinition, TileData, TileExit, NpcTemplate, NpcPlacement, ObjTemplate } from '@ao/shared-world';
import { AO_MAP_SIZE } from '@ao/shared-world';

/**
 * Loads the imported world data (maps, NPCs, objects) from disk and provides
 * fast query methods used by the game server for collision detection, portal
 * resolution, NPC lookups, etc.
 *
 * All map data is lazily loaded: the first time a map is requested it is read
 * from disk and cached.  The manifest, NPC templates, NPC placements and
 * object templates are loaded eagerly at startup since they are small.
 */
export class WorldDataService {
  private readonly dataDir: string;
  private readonly mapCache = new Map<number, MapDefinition>();
  private readonly availableMapIds: number[] = [];

  // Eagerly loaded data
  readonly npcTemplates: Record<number, NpcTemplate>;
  readonly npcPlacements: NpcPlacement[];
  readonly objTemplates: Record<number, ObjTemplate>;

  constructor(dataDir?: string) {
    const moduleDir = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1'));

    const resolvedDataDir = dataDir ?? this.resolveDefaultDataDir(moduleDir);
    this.dataDir = resolvedDataDir;

    // Load manifest
    const manifestPath = path.join(this.dataDir, 'map-manifest.json');
    const manifest: Array<{ mapId: number }> = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    this.availableMapIds = manifest.map((m) => m.mapId).sort((a, b) => a - b);

    // Load NPC / object data
    this.npcTemplates = JSON.parse(fs.readFileSync(path.join(this.dataDir, 'npc-templates.json'), 'utf-8'));
    this.npcPlacements = JSON.parse(fs.readFileSync(path.join(this.dataDir, 'npc-placements.json'), 'utf-8'));
    this.objTemplates = JSON.parse(fs.readFileSync(path.join(this.dataDir, 'obj-templates.json'), 'utf-8'));

    console.log(`[WorldData] Loaded manifest with ${this.availableMapIds.length} maps, ${Object.keys(this.npcTemplates).length} NPC templates, ${this.npcPlacements.length} NPC placements`);
  }

  private resolveDefaultDataDir(moduleDir: string): string {
    const candidates = [
      // Normal dev/build location from apps/game-server/src/world or dist/world.
      path.resolve(moduleDir, '../../../../packages/shared-world/data'),
      // Fallbacks for alternate launch directories.
      path.resolve(process.cwd(), 'packages/shared-world/data'),
      path.resolve(process.cwd(), '../packages/shared-world/data'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, 'map-manifest.json'))) {
        return candidate;
      }
    }

    throw new Error(
      `[WorldData] Could not resolve shared-world data directory. Checked: ${candidates.join(', ')}`,
    );
  }

  /** Get the list of all available map IDs. */
  getMapIds(): readonly number[] {
    return this.availableMapIds;
  }

  /** Check if a map exists. */
  hasMap(mapId: number): boolean {
    return this.availableMapIds.includes(mapId);
  }

  /** Load a map definition (lazy, cached). */
  getMap(mapId: number): MapDefinition | undefined {
    let cached = this.mapCache.get(mapId);
    if (cached) return cached;

    const filePath = path.join(this.dataDir, 'maps', `map_${mapId}.json`);
    if (!fs.existsSync(filePath)) return undefined;

    cached = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as MapDefinition;
    this.mapCache.set(mapId, cached);
    return cached;
  }

  /** Get a tile from a map (0-indexed). Returns undefined if out of bounds or map missing. */
  getTile(mapId: number, x: number, y: number): TileData | undefined {
    const map = this.getMap(mapId);
    if (!map) return undefined;
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx < 0 || rx >= map.width || ry < 0 || ry >= map.height) return undefined;
    return map.tiles[ry]?.[rx];
  }

  /** Returns true if the tile at (x,y) on the given map is blocked or out of bounds. */
  isSolid(mapId: number, x: number, y: number): boolean {
    const tile = this.getTile(mapId, x, y);
    if (!tile) return true; // out of bounds = solid
    return tile.blocked;
  }

  /** Returns the tile exit at the given position, or undefined. */
  getTileExit(mapId: number, x: number, y: number): TileExit | undefined {
    const tile = this.getTile(mapId, x, y);
    return tile?.tileExit;
  }

  /** Get all NPC placements for a given map. */
  getNpcPlacementsForMap(mapId: number): NpcPlacement[] {
    return this.npcPlacements.filter((p) => p.mapNum === mapId);
  }

  /** Get an NPC template by index. */
  getNpcTemplate(npcIndex: number): NpcTemplate | undefined {
    return this.npcTemplates[npcIndex];
  }

  /** Preload a set of maps into cache (e.g. the starting map + neighbours). */
  preloadMaps(mapIds: number[]): void {
    for (const id of mapIds) {
      this.getMap(id);
    }
    console.log(`[WorldData] Preloaded ${mapIds.length} maps into cache`);
  }
}

/** Singleton for the game server. */
let _instance: WorldDataService | undefined;

export function getWorldData(): WorldDataService {
  if (!_instance) {
    _instance = new WorldDataService();
  }
  return _instance;
}
