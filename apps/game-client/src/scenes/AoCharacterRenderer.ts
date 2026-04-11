import Phaser from 'phaser';
import type { AoGrhRuntime } from './AoGrhRuntime';

// ─── AO character init-data shapes ──────────────────────────────────────────

interface BodyEntry {
  [heading: string]: number;
  headOffsetX: number;
  headOffsetY: number;
}

interface CascoEntry {
  [heading: string]: number;
  offsetX: number;
  offsetY: number;
}

type BodiesData = Record<string, BodyEntry>;
type HeadsData  = Record<string, Record<string, number>>;
type CascosData = Record<string, CascoEntry>;

// ─── Public types ────────────────────────────────────────────────────────────

export const DIRECTION_TO_HEADING: Record<string, number> = {
  up: 1,
  down: 2,
  right: 3,
  left: 4,
};

export interface CharVisuals {
  idBody:    number;
  idHead:    number;
  idHelmet:  number;
  direction: string;   // 'up' | 'down' | 'right' | 'left'
  name:      string;
  nameColor: string;
  ghost:     boolean;
  dead:      boolean;
}

// ─── Internal container-data keys ────────────────────────────────────────────

const KEY_BODY_IMG    = 'ch_body';
const KEY_HEAD_IMG    = 'ch_head';
const KEY_HELMET_IMG  = 'ch_helmet';
const KEY_FRAME       = 'ch_frame';
const KEY_VISUALS     = 'ch_vis';

// ─── AoCharacterRenderer ─────────────────────────────────────────────────────

/**
 * Renders AO-style layered characters (body + head + helmet) inside Phaser
 * Containers, mirroring the drawChar() logic from argentumonlineweb-cliente.
 *
 * Draw order and positioning matches the original engine.js exactly:
 *   Head:   (sX + 8 + headOffsetX,    sY + headOffsetY - 18)
 *   Body:   (sX + 16 - floor(w/2),    sY + 32 - h)
 *   Helmet: (head position + casco offsets)
 */
export class AoCharacterRenderer {
  private readonly scene:   Phaser.Scene;
  private readonly runtime: AoGrhRuntime;
  private readonly bodies:  BodiesData;
  private readonly heads:   HeadsData;
  private readonly cascos:  CascosData;

  constructor(
    scene:   Phaser.Scene,
    runtime: AoGrhRuntime,
    bodies:  BodiesData,
    heads:   HeadsData,
    cascos:  CascosData,
  ) {
    this.scene   = scene;
    this.runtime = runtime;
    this.bodies  = bodies;
    this.heads   = heads;
    this.cascos  = cascos;
  }

  // ─── Asset collection ───────────────────────────────────────────────────

  /**
   * Returns all sprite-sheet numFiles required to render this character
   * in any direction.  Pass the result to AoGrhRuntime.preloadNumFiles().
   */
  collectNumFiles(idBody: number, idHead: number, idHelmet: number): string[] {
    const fileSet = new Set<string>();

    for (const heading of [1, 2, 3, 4]) {
      // Body (animated)
      const bodyParentGrh = this.bodies[String(idBody)]?.[String(heading)];
      if (bodyParentGrh) this.collectFromParentGrh(bodyParentGrh, fileSet);

      // Head (static single-frame)
      const headGrh = this.heads[String(idHead)]?.[String(heading)];
      if (headGrh) {
        const r = this.runtime.resolveGrh(headGrh);
        if (r) fileSet.add(r.numFile);
      }

      // Helmet (static single-frame, optional)
      if (idHelmet > 0) {
        const helmetGrh = this.cascos[String(idHelmet)]?.[String(heading)];
        if (helmetGrh) {
          const r = this.runtime.resolveGrh(helmetGrh);
          if (r) fileSet.add(r.numFile);
        }
      }
    }

    return Array.from(fileSet);
  }

  private collectFromParentGrh(grhIndex: number, fileSet: Set<string>): void {
    const entry = this.runtime.getGrhEntry(grhIndex) as {
      numFile?: unknown;
      frames?: Record<string, unknown>;
    } | undefined;
    if (!entry) return;

    if (entry.numFile != null) {
      // Already a static frame
      const r = this.runtime.resolveGrh(grhIndex);
      if (r) fileSet.add(r.numFile);
      return;
    }
    if (entry.frames) {
      for (const v of Object.values(entry.frames)) {
        const r = this.runtime.resolveGrh(Number(v));
        if (r) fileSet.add(r.numFile);
      }
    }
  }

  // ─── Container layer management ─────────────────────────────────────────

  /**
   * Attaches three hidden Image game-objects (body, head, helmet) to the
   * container.  Call once after container creation, before applyVisuals().
   */
  initLayers(container: Phaser.GameObjects.Container): void {
    const blank = '__DEFAULT';
    const bodyImg   = this.scene.add.image(0, 0, blank).setOrigin(0, 0).setVisible(false);
    const headImg   = this.scene.add.image(0, 0, blank).setOrigin(0, 0).setVisible(false);
    const helmetImg = this.scene.add.image(0, 0, blank).setOrigin(0, 0).setVisible(false);

    container.add([bodyImg, headImg, helmetImg]);
    container.setData(KEY_BODY_IMG,   bodyImg);
    container.setData(KEY_HEAD_IMG,   headImg);
    container.setData(KEY_HELMET_IMG, helmetImg);
    container.setData(KEY_FRAME,      1);
  }

  /**
   * Applies (or re-applies) the full visual state to the container.
   * Resets the animation frame counter back to 1.
   */
  applyVisuals(container: Phaser.GameObjects.Container, visuals: CharVisuals): void {
    container.setData(KEY_VISUALS, visuals);
    container.setData(KEY_FRAME,   1);
    this.renderFrame(container, visuals, 1);
  }

  /**
   * Must be called each game-loop tick (from GameScene.update).
   * Advances the body animation when the character is moving.
   */
  tick(
    container: Phaser.GameObjects.Container,
    delta: number,
    isMoving: boolean,
  ): void {
    const visuals = container.getData(KEY_VISUALS) as CharVisuals | undefined;
    if (!visuals) return;

    let frameCounter = (container.getData(KEY_FRAME) as number | undefined) ?? 1;

    if (isMoving) {
      const heading       = DIRECTION_TO_HEADING[visuals.direction] ?? 2;
      const bodyParentGrh = this.bodies[String(visuals.idBody)]?.[String(heading)];
      if (bodyParentGrh) {
        const parentEntry = this.runtime.getGrhEntry(bodyParentGrh) as {
          speed?:     number;
          numFrames?: number;
        } | undefined;
        if (parentEntry?.speed && parentEntry.numFrames) {
          frameCounter += delta / parentEntry.speed;
          if (Math.ceil(frameCounter) > parentEntry.numFrames) {
            frameCounter = delta / parentEntry.speed;
          }
        }
      }
    } else {
      frameCounter = 1;
    }

    container.setData(KEY_FRAME, frameCounter);
    this.renderFrame(container, visuals, frameCounter);
  }

  // ─── Internal rendering ──────────────────────────────────────────────────

  private renderFrame(
    container:    Phaser.GameObjects.Container,
    visuals:      CharVisuals,
    frameCounter: number,
  ): void {
    const heading    = DIRECTION_TO_HEADING[visuals.direction] ?? 2;
    const bodyEntry  = this.bodies[String(visuals.idBody)];
    const headOX     = bodyEntry?.headOffsetX ?? 0;
    const headOY     = bodyEntry?.headOffsetY ?? 0;

    const ghostAlpha = visuals.ghost ? 0.6 : 1;

    // ── Body ──────────────────────────────────────────────────────────────
    const bodyImg = container.getData(KEY_BODY_IMG) as Phaser.GameObjects.Image | undefined;
    if (bodyImg && visuals.idBody > 0) {
      const bodyParentGrh = bodyEntry?.[String(heading)];
      if (bodyParentGrh) {
        const resolved = this.resolveAnimatedFrame(bodyParentGrh, Math.ceil(frameCounter));
        if (resolved) {
          const tx   = this.textureKey(resolved.numFile);
          if (this.scene.textures.exists(tx)) {
            const posX = -Math.floor(resolved.width / 2);
            const posY = 16 - resolved.height;
            this.applyImageLayer(bodyImg, tx, resolved.sX, resolved.sY, resolved.width, resolved.height, posX, posY, ghostAlpha);
          }
        }
      } else {
        bodyImg.setVisible(false);
      }
    } else if (bodyImg) {
      bodyImg.setVisible(false);
    }

    // ── Head ──────────────────────────────────────────────────────────────
    const headImg = container.getData(KEY_HEAD_IMG) as Phaser.GameObjects.Image | undefined;
    if (headImg && visuals.idHead > 0) {
      const headGrh = this.heads[String(visuals.idHead)]?.[String(heading)];
      if (headGrh) {
        const resolved = this.runtime.resolveGrh(headGrh);
        if (resolved) {
          const tx   = this.textureKey(resolved.numFile);
          if (this.scene.textures.exists(tx)) {
            const posX = headOX - 8;
            const posY = headOY - 34;
            this.applyImageLayer(headImg, tx, resolved.sX, resolved.sY, resolved.width, resolved.height, posX, posY, ghostAlpha);
          }
        }
      } else {
        headImg.setVisible(false);
      }
    } else if (headImg) {
      headImg.setVisible(false);
    }

    // ── Helmet ────────────────────────────────────────────────────────────
    const helmetImg = container.getData(KEY_HELMET_IMG) as Phaser.GameObjects.Image | undefined;
    if (helmetImg) {
      if (visuals.idHelmet > 0) {
        const cascoEntry  = this.cascos[String(visuals.idHelmet)];
        const helmetGrh   = cascoEntry?.[String(heading)];
        if (helmetGrh) {
          const resolved = this.runtime.resolveGrh(helmetGrh);
          if (resolved) {
            const tx = this.textureKey(resolved.numFile);
            if (this.scene.textures.exists(tx)) {
              const posX = headOX - 8 + (cascoEntry.offsetX ?? 0);
              const posY = headOY - 34 + (cascoEntry.offsetY ?? 0);
              this.applyImageLayer(helmetImg, tx, resolved.sX, resolved.sY, resolved.width, resolved.height, posX, posY, ghostAlpha);
            }
          }
        }
        helmetImg.setVisible(true);
      } else {
        helmetImg.setVisible(false);
      }
    }
  }

  /**
   * Resolves the actual static frame from an animated GRH parent entry.
   * An animated GRH has `frames: { "1": subGrh, "2": subGrh, ... }`.
   * Each sub-GRH has numFile/sX/sY/width/height.
   */
  private resolveAnimatedFrame(
    parentGrhIndex: number,
    frameNum: number,
  ): { numFile: string; sX: number; sY: number; width: number; height: number } | null {
    const parentEntry = this.runtime.getGrhEntry(parentGrhIndex) as {
      numFile?: unknown;
      frames?: Record<string, unknown>;
    } | undefined;
    if (!parentEntry) return null;

    // Already a static frame
    if (parentEntry.numFile != null) {
      return this.runtime.resolveGrh(parentGrhIndex);
    }

    if (parentEntry.frames) {
      const key           = String(Math.max(1, frameNum));
      const candidateGrh  = parentEntry.frames[key] ?? parentEntry.frames['1'];
      if (candidateGrh != null) {
        return this.runtime.resolveGrh(Number(candidateGrh));
      }
    }

    return null;
  }

  private applyImageLayer(
    img:      Phaser.GameObjects.Image,
    texKey:   string,
    sX:       number,
    sY:       number,
    width:    number,
    height:   number,
    posX:     number,
    posY:     number,
    alpha:    number,
  ): void {
    const frameName = this.ensureFrame(texKey, sX, sY, width, height);
    img.setTexture(texKey, frameName);
    img.setPosition(posX, posY);
    img.setAlpha(alpha);
    img.setVisible(true);
  }

  private ensureFrame(
    texKey: string,
    sX: number,
    sY: number,
    width: number,
    height: number,
  ): string {
    const frameName = `${sX}:${sY}:${width}:${height}`;
    const texture = this.scene.textures.get(texKey);

    if (!texture.has(frameName)) {
      texture.add(frameName, 0, sX, sY, width, height);
    }

    return frameName;
  }

  private textureKey(numFile: string): string {
    return `ao-gfx-${numFile}`;
  }
}
