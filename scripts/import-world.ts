/**
 * import-world.ts
 *
 * Reads legacy Argentum Online Web data from the neighbouring repository
 * (argentumonlineweb-servidor) and produces normalized JSON files consumed
 * by the Reino del Umbral game-server and game-client.
 *
 * Usage:
 *   npx tsx scripts/import-world.ts [--maps 1,2,3] [--out <dir>]
 *
 * When --maps is omitted every map found in the source is imported.
 * Output lands by default in packages/shared-world/data/.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  MapDefinition,
  MapMetadata,
  NpcDropEntry,
  NpcPlacement,
  NpcTemplate,
  NpcType,
  ObjTemplate,
  TileData,
  TileGraphics,
  WorldBundle,
} from '@ao/shared-world';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function argValue(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1'));

const AO_SERVER_ROOT = path.resolve(
  __dirname,
  '../../dcatanzaro/argentumonlineweb-servidor',
);
const OUT_DIR = path.resolve(
  argValue('--out') ??
    path.join(__dirname, '../packages/shared-world/data'),
);
const mapFilter = argValue('--maps')
  ?.split(',')
  .map((s) => parseInt(s, 10));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson<T = unknown>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

// ---------------------------------------------------------------------------
// Map importer
// ---------------------------------------------------------------------------

interface LegacyTile {
  blocked?: 0 | 1;
  graphics?: Record<string, number>;
  objInfo?: { objIndex: number; amount: number };
  tileExit?: { map: number; x: number; y: number };
  trigger?: number;
}

type LegacyMapJson = Record<string, Record<string, Record<string, LegacyTile>>>;

interface LegacyDat {
  name: string;
  musicNum: number;
  magiaSinEfecto: number;
  noEncriptarMp?: number;
  terreno: string;
  zona: string;
  restringir: string;
  backup: number;
  pk: number;
}

function importMap(mapId: number): MapDefinition {
  const mapPath = path.join(AO_SERVER_ROOT, 'mapas', `mapa_${mapId}.json`);
  const datPath = path.join(AO_SERVER_ROOT, 'mapas', 'dats', `mapa_${mapId}.json`);

  const raw: LegacyMapJson = readJson(mapPath);
  const dat: LegacyDat = readJson(datPath);

  const mapData = raw[String(mapId)];
  if (!mapData) throw new Error(`Map ${mapId}: no root key "${mapId}" found`);

  const width = 100;
  const height = 100;

  // Build 2D tile array (0-indexed; legacy is 1-indexed)
  const tiles: TileData[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, (): TileData => ({
      blocked: false,
      graphics: {},
    })),
  );

  for (const [yStr, row] of Object.entries(mapData)) {
    for (const [xStr, legacy] of Object.entries(row)) {
      const y = parseInt(yStr, 10) - 1; // 1-indexed → 0-indexed
      const x = parseInt(xStr, 10) - 1;
      if (y < 0 || y >= height || x < 0 || x >= width) continue;

      const gfx: TileGraphics = {};
      if (legacy.graphics) {
        if (legacy.graphics['1']) gfx.ground = legacy.graphics['1'];
        if (legacy.graphics['2']) gfx.roof = legacy.graphics['2'];
        if (legacy.graphics['3']) gfx.decoration = legacy.graphics['3'];
        if (legacy.graphics['4']) gfx.roofEffect = legacy.graphics['4'];
      }

      const tile: TileData = {
        blocked: legacy.blocked === 1,
        graphics: gfx,
      };

      if (legacy.objInfo) tile.objInfo = legacy.objInfo;
      if (legacy.tileExit) tile.tileExit = legacy.tileExit;
      if (legacy.trigger != null) tile.trigger = legacy.trigger;

      tiles[y][x] = tile;
    }
  }

  const metadata: MapMetadata = {
    name: dat.name,
    musicNum: dat.musicNum,
    magiaSinEfecto: dat.magiaSinEfecto === 1,
    noEncriptarMp: (dat.noEncriptarMp ?? 0) === 1,
    terreno: dat.terreno,
    zona: dat.zona,
    restringir: dat.restringir,
    backup: dat.backup === 1,
    pk: dat.pk === 1,
  };

  return { mapId, width, height, metadata, tiles };
}

// ---------------------------------------------------------------------------
// NPC importer
// ---------------------------------------------------------------------------

interface LegacyNpc {
  name: string;
  npcType: number;
  idHead: number;
  idBody: number;
  movement: number;
  aguaValida: number;
  exp: number;
  hp: number;
  maxHp: number;
  maxHit: number;
  minHit: number;
  def: number;
  poderAtaque: number;
  poderEvasion: number;
  drop?: Array<{ objIndex: number; chance: number }>;
}

function importNpcTemplates(): Record<number, NpcTemplate> {
  const raw: Record<string, LegacyNpc> = readJson(
    path.join(AO_SERVER_ROOT, 'jsons', 'npcs.json'),
  );

  const result: Record<number, NpcTemplate> = {};
  for (const [idStr, legacy] of Object.entries(raw)) {
    const idx = parseInt(idStr, 10);
    const drops: NpcDropEntry[] = (legacy.drop ?? []).map((d) => ({
      objIndex: d.objIndex,
      chance: d.chance,
    }));

    result[idx] = {
      npcIndex: idx,
      name: legacy.name,
      npcType: legacy.npcType as NpcType,
      idHead: legacy.idHead,
      idBody: legacy.idBody,
      movement: legacy.movement,
      aguaValida: legacy.aguaValida === 1,
      exp: legacy.exp,
      hp: legacy.hp,
      maxHp: legacy.maxHp,
      maxHit: legacy.maxHit,
      minHit: legacy.minHit,
      def: legacy.def,
      poderAtaque: legacy.poderAtaque,
      poderEvasion: legacy.poderEvasion,
      drop: drops,
    };
  }
  return result;
}

function importNpcPlacements(): NpcPlacement[] {
  const raw: Array<{ mapNum: number; y: number; x: number; npcIndex: number }> =
    readJson(path.join(AO_SERVER_ROOT, 'jsons', 'npcsInMap.json'));

  return raw.map((p) => ({
    mapNum: p.mapNum,
    x: p.x - 1, // 1-indexed → 0-indexed
    y: p.y - 1,
    npcIndex: p.npcIndex,
  }));
}

// ---------------------------------------------------------------------------
// Object (item) importer
// ---------------------------------------------------------------------------

interface LegacyObj {
  name: string;
  objType: number;
  grhIndex: number;
  anim: number;
}

function importObjTemplates(): Record<number, ObjTemplate> {
  const raw: Record<string, LegacyObj> = readJson(
    path.join(AO_SERVER_ROOT, 'jsons', 'objs.json'),
  );

  const result: Record<number, ObjTemplate> = {};
  for (const [idStr, legacy] of Object.entries(raw)) {
    const idx = parseInt(idStr, 10);
    result[idx] = {
      objIndex: idx,
      name: legacy.name,
      objType: legacy.objType,
      grhIndex: legacy.grhIndex,
      anim: legacy.anim !== 0,
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log(`AO server root : ${AO_SERVER_ROOT}`);
  console.log(`Output dir     : ${OUT_DIR}`);

  if (!fs.existsSync(path.join(AO_SERVER_ROOT, 'mapas'))) {
    console.error('ERROR: Cannot find argentumonlineweb-servidor/mapas/');
    process.exit(1);
  }

  // Discover maps
  const allMapFiles = fs
    .readdirSync(path.join(AO_SERVER_ROOT, 'mapas'))
    .filter((f) => /^mapa_\d+\.json$/.test(f))
    .map((f) => parseInt(f.match(/\d+/)![0], 10))
    .sort((a, b) => a - b);

  const mapIds = mapFilter
    ? allMapFiles.filter((id) => mapFilter.includes(id))
    : allMapFiles;

  console.log(`Importing ${mapIds.length} maps…`);

  // Import maps
  const maps: Record<number, MapDefinition> = {};
  for (const id of mapIds) {
    maps[id] = importMap(id);
  }
  console.log(`✓ ${Object.keys(maps).length} maps imported`);

  // Import NPCs
  const npcTemplates = importNpcTemplates();
  console.log(`✓ ${Object.keys(npcTemplates).length} NPC templates`);

  const npcPlacements = importNpcPlacements();
  console.log(`✓ ${npcPlacements.length} NPC placements`);

  // Import objects
  const objTemplates = importObjTemplates();
  console.log(`✓ ${Object.keys(objTemplates).length} object templates`);

  // Write output
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Write individual map files for lazy loading
  const mapsDir = path.join(OUT_DIR, 'maps');
  fs.mkdirSync(mapsDir, { recursive: true });
  for (const [id, def] of Object.entries(maps)) {
    fs.writeFileSync(
      path.join(mapsDir, `map_${id}.json`),
      JSON.stringify(def),
    );
  }
  console.log(`✓ Individual map files written to ${mapsDir}`);

  // Write shared data
  fs.writeFileSync(
    path.join(OUT_DIR, 'npc-templates.json'),
    JSON.stringify(npcTemplates),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'npc-placements.json'),
    JSON.stringify(npcPlacements),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'obj-templates.json'),
    JSON.stringify(objTemplates),
  );

  // Write a lightweight manifest listing all map IDs + names
  const manifest = mapIds.map((id) => ({
    mapId: id,
    name: maps[id].metadata.name,
    zona: maps[id].metadata.zona,
    terreno: maps[id].metadata.terreno,
    pk: maps[id].metadata.pk,
  }));
  fs.writeFileSync(
    path.join(OUT_DIR, 'map-manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`✓ Manifest written`);

  console.log('Done!');
}

main();
