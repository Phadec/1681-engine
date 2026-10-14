import { Sprite, Texture } from 'pixi.js';
import type { Stage } from '../core/Stage';
import { mixToWhite, type GradeState } from './grade';

export interface ColorGradeOptions {
  /** How often (ms) the grade is read again: the hour moves slowly, so not every frame (default 500). */
  readEveryMs?: number;
}

/**
 * A colour laid over the whole screen in **multiply**, so it tints the world (a marsh mossy, a peak ember, a dead
 * land pale) without washing the art toward white the way a normal-blend sheet would. One white quad, tinted: no
 * filter pass, which is what a phone can spare every frame.
 *
 * `read` returns the grade now (`gradeAt` from a place's `Grade` and `DayClock`'s night, say); it is asked a few
 * times a second, and a grade that comes to white is not drawn at all.
 */
export class ColorGrade {
  private readonly sheet = new Sprite({ texture: Texture.WHITE });
  private readAt = -Infinity;
  private blank = false;
  private readonly every: number;

  constructor(
    private readonly stage: Stage,
    private readonly read: () => GradeState | null,
    options: ColorGradeOptions = {},
  ) {
    this.every = options.readEveryMs ?? 500;
    this.sheet.blendMode = 'multiply';
    this.sheet.visible = false;
    stage.screen.addChild(this.sheet);
  }

  /** Reads the grade again on the next update (the place changed). */
  invalidate(): void {
    this.readAt = -Infinity;
  }

  /** `enabled`: the game's setting, and off under a battery saver — a full-screen blend is a cost on a phone. */
  update(now: number, enabled = true): void {
    if (!enabled) {
      this.sheet.visible = false;
      this.readAt = -Infinity;
      return;
    }
    if (now - this.readAt >= this.every) {
      this.readAt = now;
      const g = this.read();
      const tint = g ? mixToWhite(g.color, g.alpha) : 0xffffff;
      this.blank = tint === 0xffffff;
      this.sheet.tint = tint;
    }
    this.sheet.visible = !this.blank;
    if (this.blank) return;
    const { width, height } = this.stage;
    if (this.sheet.width !== width) this.sheet.width = width;
    if (this.sheet.height !== height) this.sheet.height = height;
  }

  destroy(): void {
    this.sheet.destroy();
  }
}
