import { CanvasSource, Container, Texture, TilingSprite } from 'pixi.js';
import type { Transition, TransitionContext } from './Transition';
import { DITHER_LEVELS, ditherCovered, wipeLevel } from './ditherMask';
import { tweenDone } from './tweenDone';

export interface DitherWipeOptions {
  /** `0xrrggbb` (default black). */
  color?: number;
  /** Ms for each half (default 450). */
  duration?: number;
  /** The way the wipe travels, or 'none' for the whole screen dissolving at once (default 'right'). */
  direction?: 'left' | 'right' | 'up' | 'down' | 'none';
  /** Screen pixels per dither cell (default the main camera's zoom, so a cell is one world pixel). */
  cell?: number;
  /** Share of the screen the dithered edge spans (default 0.35). */
  softness?: number;
}

/** One 4×4 tile per dither level, white on clear, shared by every wipe (17 tiny textures for the page's life). */
let patterns: Texture[] | null = null;

function patternTextures(): Texture[] {
  if (patterns) return patterns;
  patterns = [];
  for (let level = 0; level <= DITHER_LEVELS; level++) {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ffffff';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (ditherCovered(level, x, y)) g.fillRect(x, y, 1, 1);
    patterns.push(new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'nearest' }) }));
  }
  return patterns;
}

/**
 * A pixel-friendly wipe: the screen fills with an ordered-dither pattern whose density sweeps across it, in hard
 * whole cells rather than a smooth gradient. The screen is cut into bands along the direction of travel, each a
 * tiling sprite of one dither level, so a frame costs a texture swap per band rather than a rect per cell (a
 * 1080p screen at 2-px cells is half a million cells). Bands are whole tiles wide so the pattern runs on unbroken.
 */
export class DitherWipeTransition implements Transition {
  private readonly bands: TilingSprite[] = [];
  private root: Container | null = null;
  private stopResize: (() => void) | null = null;
  private readonly state = { p: 0 };
  private reversed = false;

  constructor(private readonly options: DitherWipeOptions = {}) {}

  async cover(ctx: TransitionContext): Promise<void> {
    this.root = new Container();
    ctx.layer.addChild(this.root);
    this.layout(ctx);
    this.stopResize = ctx.stage.onResize(() => this.layout(ctx));
    this.state.p = 0;
    this.reversed = false;
    await this.run(ctx, 1);
  }

  async reveal(ctx: TransitionContext): Promise<void> {
    if (!this.root) return;
    // the covered part retreats the way the wipe came in, so the sweep reads as one motion across the swap
    this.reversed = true;
    await this.run(ctx, 0);
  }

  dispose(): void {
    this.stopResize?.();
    this.stopResize = null;
    this.root?.destroy({ children: true });
    this.root = null;
    this.bands.length = 0;
  }

  private run(ctx: TransitionContext, to: number): Promise<void> {
    return tweenDone(ctx.stage, {
      targets: this.state,
      p: to,
      duration: this.options.duration ?? 450,
      ease: 'Linear',
      onUpdate: () => this.paint(),
    });
  }

  private layout(ctx: TransitionContext): void {
    const root = this.root!;
    for (const b of root.removeChildren()) b.destroy();
    this.bands.length = 0;
    const cell = Math.max(1, Math.round(this.options.cell ?? ctx.stage.cameras.main.zoom));
    const tile = cell * 4;
    const w = ctx.stage.width;
    const h = ctx.stage.height;
    const dir = this.options.direction ?? 'right';
    const horizontal = dir === 'left' || dir === 'right';
    const span = dir === 'none' ? 0 : horizontal ? w : h;
    // about 32 bands across, each a whole number of tiles
    const bandSize = dir === 'none' ? 0 : Math.max(tile, Math.ceil(span / 32 / tile) * tile);
    const count = dir === 'none' ? 1 : Math.ceil(span / bandSize);
    for (let i = 0; i < count; i++) {
      const bw = dir === 'none' || !horizontal ? w : bandSize;
      const bh = dir === 'none' || horizontal ? h : bandSize;
      const s = new TilingSprite({ texture: patternTextures()[0]!, width: bw, height: bh });
      s.tileScale.set(cell, cell);
      if (dir !== 'none') {
        if (horizontal) s.x = i * bandSize;
        else s.y = i * bandSize;
      }
      s.tint = this.options.color ?? 0x000000;
      root.addChild(s);
      this.bands.push(s);
    }
    this.paint();
  }

  private paint(): void {
    const dir = this.options.direction ?? 'right';
    const soft = dir === 'none' ? 1 : (this.options.softness ?? 0.35);
    const textures = patternTextures();
    const n = this.bands.length;
    for (let i = 0; i < n; i++) {
      let u = dir === 'none' ? 0.5 : (i + 0.5) / n;
      if (dir === 'left' || dir === 'up') u = 1 - u;
      if (this.reversed) u = 1 - u;
      const level = dir === 'none' ? Math.round(this.state.p * DITHER_LEVELS) : wipeLevel(this.state.p, u, soft);
      const band = this.bands[i]!;
      band.visible = level > 0;
      band.texture = textures[level]!;
    }
  }
}
