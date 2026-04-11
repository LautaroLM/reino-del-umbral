# 09 — Pipeline de datos NPC: de argentumonlineweb a reino-del-umbral

## Origen de los datos

El proyecto `argentumonlineweb-servidor` (AO Web clásico, en `../../dcatanzaro/argentumonlineweb-servidor`) contiene los datos brutos del mundo de Argentum Online en formato JSON legacy:

```
argentumonlineweb-servidor/
  mapas/
    mapa_1.json          ← tiles del mapa (1-indexed, con gráficos, colisión, portales)
    dats/
      mapa_1.json        ← metadata del mapa (nombre, música, zona, pk, etc.)
  jsons/
    npcs.json            ← templates de NPCs (stats, nombre, tipo, idBody/Head, drops)
    npcsInMap.json       ← placements: qué NPC va en qué mapa y en qué tile
    objs.json            ← templates de items/objetos
```

---

## Importación: `scripts/import-world.ts`

El script transforma ese formato legacy al formato interno de `reino-del-umbral`.

**Cómo correrlo:**
```bash
pnpm tsx scripts/import-world.ts
# o con flags:
pnpm tsx scripts/import-world.ts --maps 1,5,40 --out packages/shared-world/data
```

**Qué hace por mapa:**

1. Lee `mapa_N.json` — tiles indexados `[y][x]` con claves `1`-based.
2. Convierte cada tile a 0-indexed, extrayendo:
   - `graphics.1` → `ground`, `graphics.2` → `roof`, `graphics.3` → `decoration`, `graphics.4` → `roofEffect`
   - `blocked: 1` → `blocked: true`
   - `tileExit` → se copia tal cual (portales/puertas)
   - `trigger` → se copia tal cual
3. Lee `dats/mapa_N.json` → `MapMetadata` (nombre, música, pk, etc.)
4. Escribe `packages/shared-world/data/maps/map_N.json`

**Qué hace con NPCs:**

- Lee `jsons/npcs.json` → `Record<number, NpcTemplate>` guardado en `npc-templates.json`
- Lee `jsons/npcsInMap.json` → `NpcPlacement[]` guardado en `npc-placements.json`
- Las coordenadas en los placements quedan **1-indexed** (como en el original).

**Output final en `packages/shared-world/data/`:**
```
map-manifest.json      ← lista de mapIds disponibles
maps/
  map_1.json
  map_2.json
  ...
npc-templates.json     ← Record<npcIndex, NpcTemplate>
npc-placements.json    ← NpcPlacement[] (mapNum, x, y, npcIndex — 1-indexed)
obj-templates.json     ← Record<objIndex, ObjTemplate>
```

---

## Contratos de tipos: `packages/shared-world/src/index.ts`

```ts
interface TileData {
  blocked: boolean;
  graphics: { ground?, roof?, decoration?, roofEffect? };
  tileExit?: { map: number; x: number; y: number };  // coordenadas 1-indexed
  trigger?: number;
}

enum NpcType {
  HostileMob = 0,   // combate (ratas, serpientes,슬라임)
  Priest     = 1,
  Banker     = 4,
  Fisher     = 7,
  Crafter    = 10,
  Noble      = 11,
  // ...
}

interface NpcTemplate {
  npcIndex: number;
  name: string;
  npcType: NpcType;
  idBody: number;    // índice en el catálogo GRH de AO (body spritesheet)
  idHead: number;    // índice en el catálogo GRH de AO (head spritesheet)
  maxHp: number;
  maxHit: number;    // daño máximo
  exp: number;
  drop: NpcDropEntry[];
}

interface NpcPlacement {
  mapNum: number;    // ID del mapa (1-indexed internamente en el archivo)
  x: number;        // columna 1-indexed
  y: number;        // fila 1-indexed
  npcIndex: number; // clave en npc-templates.json
}
```

---

## Consumo en el servidor: `apps/game-server/`

### `WorldDataService.ts`
Carga los JSON importados en disco. Métodos clave:
- `getNpcPlacementsForMap(mapId)` → filtra `npc-placements.json` por `mapNum`
- `npcTemplates[npcIndex]` → acceso directo al template
- `getTileExit(mapId, x, y)` → devuelve `TileExit` si el tile es puerta/portal
- `isSolid(mapId, x, y)` → colisión real del mapa AO (no el `MAP_LAYOUT` hardcodeado)

### `GameRoom.ts → spawnWorldNpcs(mapId)`
Se llama en `onCreate()` una vez precargado el mapa:

```
Para cada NpcPlacement del mapId:
  ├─ Convierte coordenadas: x = placement.x - 1, y = placement.y - 1  (1→0 indexed)
  ├─ Lee template = worldData.npcTemplates[npcIndex]
  ├─ Si npcType === 0 (HostileMob):
  │    → crea EnemyState con stats reales del template
  │    → registra EnemyMeta para que el AI de combate lo controle
  └─ Si npcType !== 0 (pasivo):
       → crea NpcState (id, name, x, y, idBody, idHead, npcType, npcIndex)
       → queda estático en state.npcs, sincronizado a todos los clientes
```

### `GameRoom.ts → handlePortalUse(client, player)`
Se dispara cuando el jugador presiona `E`. El orden de chequeo es:
1. **Portal de mapa**: busca `tileExit` en el tile donde está parado → teletransporta
2. **NPC cercano**: busca el NpcState más próximo en radio 1.5 tiles → envía `NpcDialog`
3. **Nada**: avisa al jugador

---

## Consumo en el cliente: `apps/game-client/`

### Renderizado de tiles — `AoMapRenderer.ts`
- Recibe `MapDefinition` vía `ServerMessage.MapData`
- Por cada tile, lee `graphics.ground/decoration/roof/roofEffect` y los mapea a imágenes mediante `AoGrhRuntime` (que carga el catálogo GRH del AO)

### Renderizado de NPCs pasivos — `GameScene.ts`
- Escucha `callbacks.onAdd('npcs', ...)` del estado Colyseus
- `addNpcSprite(npcId, npc)`: crea un container Phaser con label verde y llama a `mapRenderer.applyCharacterLayers(container, { idBody, idHead, ... })` para renderizar el sprite AO
- Tras cada carga de mapa (`handleMapData`), re-aplica las capas a todos los NPCs ya existentes (el GRH runtime puede no estar listo aún cuando llega el primer NPC)

### Colisión del cliente — `AoMapRenderer.isAoSolid(x, y)`
Usa `currentMap.tiles[y][x].blocked` del mapa importado. Esto reemplaza el viejo `MAP_LAYOUT` hardcodeado de 72×28.

### Portales al pisar — `GameScene.handleMovementInput`
Cuando el jugador pisa un tile con `tileExit`, se envía automáticamente `ClientMessage.PortalUse` sin necesidad de presionar `E` (comportamiento clásico de AO):
```ts
if (this.mapRenderer.isPortalTile(targetX, targetY)) {
  this.room.send(ClientMessage.PortalUse, {});
}
```

---

## Flujo completo de una puerta de edificio

```
Usuario camina hacia la puerta
  ↓
Cliente: isPortalTile(x,y) = true (tileExit existe en el tile importado)
  ↓
Cliente envía: PortalUse {}
  ↓
Servidor: handlePortalUse
  → getTileExit(mapId, x, y) → { map: 40, x: 46, y: 8 }
  → isSolid(40, 45, 7) = false (destino walkable)
  → player.currentMapId = 40, player.x = 45, player.y = 7
  → client.send(MapTransition, { mapId: 40, ... })
  ↓
Cliente: handleMapData(map_40)
  → AoMapRenderer.buildMap(...) renderiza el mapa interior
```

---

## Consideraciones para iteraciones futuras

| Tema | Estado | Notas |
|------|--------|-------|
| NPCs en múltiples mapas | Pendiente | `spawnWorldNpcs` solo se llama para el mapa 1 en `onCreate`. Necesita llamarse también al transicionar mapas y limpiar NPCs del mapa anterior |
| Diálogo avanzado de NPCs | Pendiente | `getNpcGreeting(npcType)` devuelve texto genérico. Se puede expandir con árboles de diálogo por `npcIndex` |
| NPC hostile rendering | Parcial | Los hostile mobs se crean como `EnemyState` con `enemyType: 'mob'` pero el cliente renderiza `mob` igual que `slime` (caja colored). Se puede agregar `idBody` a `EnemyState` y usar `applyCharacterLayers` para renderizado AO real |
| Shops / Bancos | Pendiente | Los NPCs de tipo `Banker`/`Merchant` solo saludan. Falta UI de comercio |
| Re-importar datos | Comando | `pnpm tsx scripts/import-world.ts`. Los `.json` resultantes van en `packages/shared-world/data/` y son ignorados por git (o se comitean según el workflow del equipo) |
