/**
 * AoMapRenderer
 *
 * Encapsula todo lo relacionado con renderizar el mapa AO en Phaser:
 *  - Bootstrap del runtime GRH y el renderer de personajes.
 *  - Pre-carga de assets de tiles y personajes.
 *  - Construcción/destrucción de capas visuales (ground, deco, roof, roofFx).
 *  - Colisión de tiles (isAoSolid).
 *
 * GameScene delega aquí; no conoce nada de cómo se renderizan los tiles.
 */

import Phaser from 'phaser';
import type { MapDefinition } from '@ao/shared-world';
import { TILE_SIZE } from '@ao/shared-constants';
import { AoGrhRuntime } from './AoGrhRuntime';
import { AoCharacterRenderer } from './AoCharacterRenderer';
import type { CharVisuals } from './AoCharacterRenderer';

// ─── Profundidades del mapa ────────────────────────────────────────────────
// Usamos constantes nombradas para que cambiar el modelo de depth no sea
// una búsqueda de números mágicos en 3 archivos.
export const MAP_DEPTH = {
  GROUND:   0,
  /** Pie del tile Y → (tileY + 1) * TILE_SIZE — calculado por tile en runtime */
  DECO:     'per-tile' as const,
  ROOF:     5000,
  ROOF_FX:  5002,
  /** Texto flotante del nombre del mapa */
  MAP_NAME: 3,
  /** HUD / UI siempre encima de todo */
  HUD:      10000,
} as const;

// ─── Tipos públicos ────────────────────────────────────────────────────────

/** Datos mínimos de jugador que necessita el renderer para su spritesheet. */
export interface PlayerAppearance {
  idBody:   number;
  idHead:   number;
  idHelmet: number;
}

interface DecorationTileEntry {
  key: string;
  x: number;
  y: number;
  grhIndex: number;
  depth: number;
}

interface TileCullBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// ─── Clase ────────────────────────────────────────────────────────────────

export class AoMapRenderer {
  private readonly scene: Phaser.Scene;

  private runtime: AoGrhRuntime | null = null;
  private charRenderer: AoCharacterRenderer | null = null;

  /** Capas estáticas del mapa actual (ground/roof/roofFx). */
  private layerObjects: Phaser.GameObjects.GameObject[] = [];
  private mapNameText: Phaser.GameObjects.Text | null = null;

  /** Último mapa cargado — útil para colisión, portal y culling. */
  private currentMap: MapDefinition | null = null;

  /** Decoración indexada por tile para culling. */
  private decorationEntries: DecorationTileEntry[] = [];
  private activeDecoration = new Map<string, Phaser.GameObjects.Image>();
  private decorationPool: Phaser.GameObjects.Image[] = [];
  private lastCullBounds: TileCullBounds | null = null;
  private readonly cullingPaddingTiles = 6;
  /** Extra upward margin for tall decorations (tree domes, rooftops) that extend several tiles above their anchor tile. */
  private readonly cullingPaddingTilesUp = 6;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Bootstrap
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Asegura que el runtime GRH y el renderer de personajes estén listos.
   * Lazy-init: sólo construye lo que falta.
   * Llama `preloadPlayerAssets` si el charRenderer acaba de inicializarse.
   */
  async bootstrap(
    playerAppearances: PlayerAppearance[],
  ): Promise<void> {
    this.ensureRuntime();

    if (!this.charRenderer) {
      const bodies = this.scene.cache.json.get('ao_bodies')  as Record<string, unknown>;
      const heads  = this.scene.cache.json.get('ao_heads')   as Record<string, unknown>;
      const cascos = this.scene.cache.json.get('ao_cascos')  as Record<string, unknown>;

      if (bodies && heads && cascos) {
        this.charRenderer = new AoCharacterRenderer(
          this.scene,
          this.runtime!,
          bodies as never,
          heads  as never,
          cascos as never,
        );
        await this.preloadPlayerAssets(playerAppearances);
      }
    }
  }

  /**
   * Carga los archivos de spritesheet que necesita el mapa y registra los GRH ausentes.
   */
  async preloadMapAssets(map: MapDefinition): Promise<void> {
    this.ensureRuntime();
    const files = this.runtime!.collectRequiredNumFiles(map);
    await this.runtime!.preloadNumFiles(this.scene, files);
    this.runtime!.logMissingSummary();
  }

  /**
   * Carga los spritesheets de cuerpo/cabeza/casco para una lista de personajes.
   * Puede llamarse de nuevo al unirse nuevos jugadores o NPCs al mapa.
   */
  async preloadPlayerAssets(appearances: PlayerAppearance[]): Promise<void> {
    if (!this.charRenderer || !this.runtime) return;
    const files: string[] = [];
    for (const a of appearances) {
      files.push(...this.charRenderer.collectNumFiles(
        a.idBody   || 1,
        a.idHead   || 1,
        a.idHelmet || 0,
      ));
    }
    if (files.length) {
      await this.runtime.preloadNumFiles(this.scene, [...new Set(files)]);
    }
  }

  /** Alias genérico — carga assets para cualquier conjunto de appearances (jugadores, NPCs, etc.) */
  async preloadAppearances(appearances: { idBody: number; idHead: number; idHelmet?: number }[]): Promise<void> {
    return this.preloadPlayerAssets(
      appearances.map((a) => ({ idBody: a.idBody, idHead: a.idHead, idHelmet: a.idHelmet ?? 0 })),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Render del mapa
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Destruye el mapa actual y construye las capas para el mapa nuevo.
   * El caller debe haber llamado `bootstrap` y `preloadMapAssets` antes.
   */
  buildMap(map: MapDefinition): void {
    this.ensureRuntime();
    this.clear();
    this.currentMap = map;

    // Ground — canvas texture plana (nunca ocluye personajes)
    const groundImg = this.runtime!.renderLayerToTexture(
      this.scene,
      map,
      'ao-layer-ground',
      MAP_DEPTH.GROUND,
      1,
      (tile) => tile.graphics.ground,
    );

    // Techo — canvas plano, siempre encima de jugadores
    const roofImg = this.runtime!.renderLayerToTexture(
      this.scene,
      map,
      'ao-layer-roof',
      MAP_DEPTH.ROOF,
      1,
      (tile) => tile.graphics.roof,
    );

    // Efecto de techo (lluvia, niebla, etc.)
    const roofFxImg = this.runtime!.renderLayerToTexture(
      this.scene,
      map,
      'ao-layer-roof-fx',
      MAP_DEPTH.ROOF_FX,
      0.75,
      (tile) => tile.graphics.roofEffect,
    );

    this.layerObjects = [groundImg, roofImg, roofFxImg]
      .filter(Boolean) as Phaser.GameObjects.GameObject[];

    // Ajustar bounds de la cámara al tamaño real del mapa
    this.scene.cameras.main.setBounds(
      0, 0,
      map.width  * TILE_SIZE,
      map.height * TILE_SIZE,
    );

    // Texto flotante con el nombre del mapa
    this.mapNameText = this.scene.add
      .text(
        (map.width * TILE_SIZE) / 2,
        8,
        `📍 ${map.metadata.name}`,
        {
          fontSize: '14px',
          color: '#ffe066',
          backgroundColor: '#00000099',
          padding: { x: 8, y: 4 },
        },
      )
      .setOrigin(0.5, 0)
      .setDepth(MAP_DEPTH.MAP_NAME)
      .setScrollFactor(1);

    this.buildDecorationIndex(map);
    this.updateCulling(this.scene.cameras.main, true);

    console.log(
      `[AoMapRenderer] Mapa ${map.mapId}: "${map.metadata.name}" ` +
      `(${map.width}x${map.height}) — ` +
      `deco tiles: ${this.decorationEntries.length} ` +
      `(pool: ${this.decorationPool.length}, activos: ${this.activeDecoration.size})`,
    );
  }

  /**
   * Limpia el mapa actual.
   * Por defecto preserva el pool de decoración para reutilizar sprites.
   */
  clear(destroyPool = false): void {
    for (const obj of this.layerObjects) obj.destroy();
    this.layerObjects = [];

    this.releaseAllActiveDecoration();
    this.decorationEntries = [];
    this.lastCullBounds = null;

    if (destroyPool) {
      for (const img of this.decorationPool) {
        img.destroy();
      }
      this.decorationPool = [];
    }

    this.mapNameText?.destroy();
    this.mapNameText = null;
    this.currentMap = null;
  }

  /** Limpieza total para shutdown de la escena. */
  dispose(): void {
    this.clear(true);
  }

  /**
   * Actualiza el culling de decoración según el viewport de cámara.
   * Llamar una vez por frame es seguro: sólo recalcula cuando cambia la celda visible.
   */
  updateCulling(
    camera: Phaser.Cameras.Scene2D.Camera,
    force = false,
  ): void {
    if (!this.currentMap) return;

    const bounds = this.computeCullBounds(camera, this.currentMap);
    if (!force && this.lastCullBounds && this.boundsEqual(this.lastCullBounds, bounds)) {
      return;
    }
    this.lastCullBounds = bounds;

    const requiredKeys = new Set<string>();

    for (const entry of this.decorationEntries) {
      if (
        entry.x < bounds.minX || entry.x > bounds.maxX ||
        entry.y < bounds.minY || entry.y > bounds.maxY
      ) {
        continue;
      }

      requiredKeys.add(entry.key);
      if (!this.activeDecoration.has(entry.key)) {
        this.activateDecorationEntry(entry);
      }
    }

    for (const [key, sprite] of this.activeDecoration.entries()) {
      if (!requiredKeys.has(key)) {
        this.deactivateDecorationSprite(key, sprite);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Colisión
  // ──────────────────────────────────────────────────────────────────────────

  /** Devuelve true si la casilla (x, y) en coordenadas de tile es bloqueante. */
  isAoSolid(x: number, y: number): boolean {
    if (!this.currentMap) return false;
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx < 0 || rx >= this.currentMap.width || ry < 0 || ry >= this.currentMap.height) {
      return true;
    }
    return this.currentMap.tiles[ry]?.[rx]?.blocked ?? false;
  }

  /** Devuelve true si el tile (x, y) tiene una salida de portal. */
  isPortalTile(x: number, y: number): boolean {
    if (!this.currentMap) return false;
    const rx = Math.round(x);
    const ry = Math.round(y);
    return Boolean(this.currentMap.tiles[ry]?.[rx]?.tileExit);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Character renderer (delegado — GameScene sigue controlando los containers)
  // ──────────────────────────────────────────────────────────────────────────

  get characterRenderer(): AoCharacterRenderer | null {
    return this.charRenderer;
  }

  /** True cuando el mapa y el charRenderer ya están disponibles. */
  get isReady(): boolean {
    return this.runtime !== null && this.charRenderer !== null && this.currentMap !== null;
  }

  get currentMapData(): MapDefinition | null {
    return this.currentMap;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers privados
  // ──────────────────────────────────────────────────────────────────────────

  private ensureRuntime(): void {
    if (this.runtime) return;
    const rawCatalog = this.scene.cache.json.get('ao_graficos_catalog') as
      Record<string, unknown> | undefined;
    if (!rawCatalog) {
      throw new Error('[AoMapRenderer] ao_graficos_catalog no encontrado en cache. Revisar BootScene.');
    }
    this.runtime = new AoGrhRuntime(rawCatalog as Record<string, never>);
  }

  private buildDecorationIndex(map: MapDefinition): void {
    this.decorationEntries = [];

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y]?.[x];
        const grhIndex = tile?.graphics.decoration;
        if (grhIndex == null) continue;

        this.decorationEntries.push({
          key: `${x}:${y}`,
          x,
          y,
          grhIndex,
          depth: (y + 1) * TILE_SIZE,
        });
      }
    }
  }

  private computeCullBounds(
    camera: Phaser.Cameras.Scene2D.Camera,
    map: MapDefinition,
  ): TileCullBounds {
    const worldView = camera.worldView;

    const minX = Math.max(0, Math.floor(worldView.x / TILE_SIZE) - this.cullingPaddingTiles);
    const maxX = Math.min(map.width - 1, Math.ceil((worldView.x + worldView.width) / TILE_SIZE) + this.cullingPaddingTiles);
    const minY = Math.max(0, Math.floor(worldView.y / TILE_SIZE) - this.cullingPaddingTiles - this.cullingPaddingTilesUp);
    const maxY = Math.min(map.height - 1, Math.ceil((worldView.y + worldView.height) / TILE_SIZE) + this.cullingPaddingTiles);

    return { minX, maxX, minY, maxY };
  }

  private boundsEqual(a: TileCullBounds, b: TileCullBounds): boolean {
    return a.minX === b.minX && a.maxX === b.maxX && a.minY === b.minY && a.maxY === b.maxY;
  }

  private activateDecorationEntry(entry: DecorationTileEntry): void {
    if (!this.runtime) return;

    const descriptor = this.runtime.resolveTileSpriteDescriptor(
      this.scene,
      entry.grhIndex,
      entry.x,
      entry.y,
    );
    if (!descriptor) return;

    const pooled = this.decorationPool.pop();
    const sprite = pooled
      ? pooled
          .setTexture(descriptor.textureKey, descriptor.frameName)
          .setPosition(descriptor.drawX, descriptor.drawY)
          .setOrigin(0, 0)
          .setDepth(entry.depth)
          .setAlpha(1)
          .setVisible(true)
          .setActive(true)
      : this.scene.add
          .image(descriptor.drawX, descriptor.drawY, descriptor.textureKey, descriptor.frameName)
          .setOrigin(0, 0)
          .setDepth(entry.depth)
          .setAlpha(1);

    this.activeDecoration.set(entry.key, sprite);
  }

  private deactivateDecorationSprite(key: string, sprite: Phaser.GameObjects.Image): void {
    sprite.setVisible(false).setActive(false);
    this.activeDecoration.delete(key);
    this.decorationPool.push(sprite);
  }

  private releaseAllActiveDecoration(): void {
    for (const [key, sprite] of this.activeDecoration.entries()) {
      this.deactivateDecorationSprite(key, sprite);
    }
  }

  /**
   * Aplica las capas visuales AO (body/head/helmet) a un Container de Phaser.
   * Wrapper delgado sobre AoCharacterRenderer para que GameScene no importe
   * AoCharacterRenderer directamente.
   */
  applyCharacterLayers(
    container: Phaser.GameObjects.Container,
    visuals: CharVisuals,
  ): void {
    if (!this.charRenderer) return;

    if (!container.getData('ch_body')) {
      this.charRenderer.initLayers(container);
      const bodyImg   = container.getData('ch_body')   as Phaser.GameObjects.Image;
      const headImg   = container.getData('ch_head')   as Phaser.GameObjects.Image;
      const helmetImg = container.getData('ch_helmet') as Phaser.GameObjects.Image;
      container.moveTo(bodyImg,   0);
      container.moveTo(headImg,   1);
      container.moveTo(helmetImg, 2);
    }

    this.charRenderer.applyVisuals(container, visuals);
  }

  /** Avanza la animación del cuerpo mientras el personaje se mueve. */
  tickCharacter(
    container: Phaser.GameObjects.Container,
    delta: number,
    isMoving: boolean,
  ): void {
    this.charRenderer?.tick(container, delta, isMoving);
  }
}
