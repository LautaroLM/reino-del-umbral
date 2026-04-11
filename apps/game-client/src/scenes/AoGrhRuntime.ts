import Phaser from 'phaser';
import type { MapDefinition, TileData } from '@ao/shared-world';
import { TILE_SIZE } from '@ao/shared-constants';

interface RawGrhEntry {
  numFrames?: number;
  numFile?: number | string;
  sX?: number;
  sY?: number;
  width?: number;
  height?: number;
  frames?: Record<string, number | string>;
  offset?: {
    x?: number;
    y?: number;
  };
}

type RawGrhCatalog = Record<string, RawGrhEntry>;

interface ResolvedGrhFrame {
  grhIndex: number;
  numFile: string;
  sX: number;
  sY: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export interface TileSpriteDescriptor {
  textureKey: string;
  frameName: string;
  drawX: number;
  drawY: number;
}

export class AoGrhRuntime {
  private readonly catalog: RawGrhCatalog;
  private readonly missingGrh = new Set<number>();

  constructor(catalog: RawGrhCatalog) {
    this.catalog = catalog;
  }

  private sourceTextureKey(numFile: string): string {
    return `ao-gfx-${numFile}`;
  }

  private getEntry(grhIndex: number): RawGrhEntry | undefined {
    return this.catalog[String(grhIndex)];
  }

  private toNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  private resolveFrame(grhIndex: number, depth = 0): ResolvedGrhFrame | null {
    if (depth > 4) return null;

    const entry = this.getEntry(grhIndex);
    if (!entry) {
      this.missingGrh.add(grhIndex);
      return null;
    }

    if (entry.numFile != null) {
      const width = this.toNumber(entry.width);
      const height = this.toNumber(entry.height);
      if (width <= 0 || height <= 0) {
        this.missingGrh.add(grhIndex);
        return null;
      }

      const ox = this.toNumber(entry.offset?.x);
      const oy = this.toNumber(entry.offset?.y);

      return {
        grhIndex,
        numFile: String(entry.numFile),
        sX: this.toNumber(entry.sX),
        sY: this.toNumber(entry.sY),
        width,
        height,
        offsetX: ox,
        offsetY: oy,
      };
    }

    const firstFrame = entry.frames?.['1'] ?? (entry.frames ? Object.values(entry.frames)[0] : undefined);
    if (firstFrame == null) {
      this.missingGrh.add(grhIndex);
      return null;
    }

    const frameGrh = this.toNumber(firstFrame, -1);
    if (frameGrh < 0) {
      this.missingGrh.add(grhIndex);
      return null;
    }

    return this.resolveFrame(frameGrh, depth + 1);
  }

  /** Public accessor for resolving a GRH index to its source frame (used by AoCharacterRenderer). */
  public resolveGrh(grhIndex: number): ResolvedGrhFrame | null {
    return this.resolveFrame(grhIndex);
  }

  /** Public accessor for the raw GRH catalog entry (used by AoCharacterRenderer for animation). */
  public getGrhEntry(grhIndex: number): RawGrhEntry | undefined {
    return this.getEntry(grhIndex);
  }

  collectRequiredNumFiles(map: MapDefinition): string[] {
    const fileSet = new Set<string>();

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y]?.[x];
        if (!tile) continue;

        const layers = [
          tile.graphics.ground,
          tile.graphics.decoration,
          tile.graphics.roof,
          tile.graphics.roofEffect,
        ];

        for (const grhIndex of layers) {
          if (grhIndex == null) continue;
          const resolved = this.resolveFrame(grhIndex);
          if (resolved) fileSet.add(resolved.numFile);
        }
      }
    }

    return Array.from(fileSet.values());
  }

  async preloadNumFiles(scene: Phaser.Scene, numFiles: string[]): Promise<void> {
    const pending = numFiles.filter((numFile) => {
      const textureKey = this.sourceTextureKey(numFile);
      return !scene.textures.exists(textureKey);
    });

    if (pending.length === 0) return;

    if (scene.load.isLoading()) {
      await new Promise<void>((resolve) => scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve()));
    }

    for (const numFile of pending) {
      const textureKey = this.sourceTextureKey(numFile);
      scene.load.image(textureKey, `/assets/ao/graficos/${encodeURIComponent(numFile)}.png`);
    }

    await new Promise<void>((resolve) => {
      const onFileError = (file: Phaser.Loader.File) => {
        if (file.key.startsWith('ao-gfx-')) {
          console.warn(`[AoGrhRuntime] Failed to load texture for key ${file.key}`);
        }
      };

      scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onFileError);
      scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
        scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onFileError);
        resolve();
      });
      scene.load.start();
    });
  }

  renderLayerToTexture(
    scene: Phaser.Scene,
    map: MapDefinition,
    textureKey: string,
    depth: number,
    alpha: number,
    pickGrh: (tile: TileData) => number | undefined,
  ): Phaser.GameObjects.Image | null {
    if (scene.textures.exists(textureKey)) {
      scene.textures.remove(textureKey);
    }

    const widthPx = map.width * TILE_SIZE;
    const heightPx = map.height * TILE_SIZE;
    const canvasTexture = scene.textures.createCanvas(textureKey, widthPx, heightPx);
    if (!canvasTexture) return null;

    const ctx = canvasTexture.context;
    ctx.clearRect(0, 0, widthPx, heightPx);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y]?.[x];
        if (!tile) continue;

        const grhIndex = pickGrh(tile);
        if (grhIndex == null) continue;

        const resolved = this.resolveFrame(grhIndex);
        if (!resolved) continue;

        const sourceTexture = scene.textures.get(this.sourceTextureKey(resolved.numFile));
        if (!sourceTexture) continue;

        const source = sourceTexture.getSourceImage() as CanvasImageSource;
        if (!source) continue;

        // AO-style anchor: center horizontally to tile and align bottom to tile base.
        const drawX = x * TILE_SIZE + Math.floor((TILE_SIZE - resolved.width) / 2) + resolved.offsetX;
        const drawY = y * TILE_SIZE + (TILE_SIZE - resolved.height) + resolved.offsetY;

        ctx.drawImage(
          source,
          resolved.sX,
          resolved.sY,
          resolved.width,
          resolved.height,
          drawX,
          drawY,
          resolved.width,
          resolved.height,
        );
      }
    }

    canvasTexture.refresh();

    return scene.add
      .image(0, 0, textureKey)
      .setOrigin(0, 0)
      .setDepth(depth)
      .setAlpha(alpha);
  }

  /**
   * Resolves a tile + GRH into a Phaser-ready sprite descriptor.
   * The returned descriptor can be reused with pooled Image objects.
   */
  resolveTileSpriteDescriptor(
    scene: Phaser.Scene,
    grhIndex: number,
    tileX: number,
    tileY: number,
  ): TileSpriteDescriptor | null {
    const resolved = this.resolveFrame(grhIndex);
    if (!resolved) return null;

    const textureKey = this.sourceTextureKey(resolved.numFile);
    if (!scene.textures.exists(textureKey)) return null;

    const tex = scene.textures.get(textureKey);
    const frameName = `${resolved.sX}:${resolved.sY}:${resolved.width}:${resolved.height}`;
    if (!tex.has(frameName)) {
      tex.add(frameName, 0, resolved.sX, resolved.sY, resolved.width, resolved.height);
    }

    // AO anchor: center-X on tile, bottom-align to tile base.
    const drawX = tileX * TILE_SIZE + Math.floor((TILE_SIZE - resolved.width) / 2) + resolved.offsetX;
    const drawY = tileY * TILE_SIZE + (TILE_SIZE - resolved.height) + resolved.offsetY;

    return {
      textureKey,
      frameName,
      drawX,
      drawY,
    };
  }

  /**
   * Renders a map layer as individual Phaser Images — one per tile with a non-null GRH.
   * Each image gets its own depth value so they can be Y-sorted with player containers
   * for correct visual overlap (e.g. trees in front of / behind characters).
   *
   * Use this instead of renderLayerToTexture for layers that need to overlap with
   * moving sprites (typically the decoration layer).
   */
  spawnLayerSprites(
    scene: Phaser.Scene,
    map: MapDefinition,
    pickGrh: (tile: TileData) => number | undefined,
    getDepth: (tileX: number, tileY: number) => number,
    alpha = 1,
  ): Phaser.GameObjects.Image[] {
    const images: Phaser.GameObjects.Image[] = [];

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y]?.[x];
        if (!tile) continue;

        const grhIndex = pickGrh(tile);
        if (grhIndex == null) continue;

        const spriteDescriptor = this.resolveTileSpriteDescriptor(scene, grhIndex, x, y);
        if (!spriteDescriptor) continue;

        const img = scene.add
          .image(
            spriteDescriptor.drawX,
            spriteDescriptor.drawY,
            spriteDescriptor.textureKey,
            spriteDescriptor.frameName,
          )
          .setOrigin(0, 0)
          .setDepth(getDepth(x, y))
          .setAlpha(alpha);

        images.push(img);
      }
    }

    return images;
  }

  logMissingSummary(): void {
    if (this.missingGrh.size === 0) return;
    const sample = Array.from(this.missingGrh.values()).slice(0, 10).join(', ');
    console.warn(`[AoGrhRuntime] Missing GRH entries: ${this.missingGrh.size}. Sample: ${sample}`);
  }
}
