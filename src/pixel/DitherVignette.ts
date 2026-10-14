import { Sprite, Texture } from 'pixi.js';
import type { Stage } from '../core/Stage';
import { vignetteMask } from './vignetteMask';

const CACHE = new Map<string, Texture>();
/** Each texture is a whole screen's worth of pixels: keep only a few sizes. */
const CACHE_MAX = 12;

/**
 * A white dithered edge for a screen of `w`×`h` world pixels, one texel a world pixel and scaled up `'nearest'`;
 * the sprite that draws it tints it. Made once per size and strength. Returns `Texture.EMPTY` when the browser has
 * no canvas memory to spare (iOS), so the caller asks again later.
 */
export function ditherVignette(w: number, h: number, strength = 1, from = 0.55): Texture {
  const tw = Math.max(1, Math.ceil(w));
  const th = Math.max(1, Math.ceil(h));
  const key = `${tw}x${th}|${strength.toFixed(2)}|${from}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Texture.EMPTY;
  const mask = vignetteMask(tw, th, strength, from);
  const img = ctx.createImageData(tw, th);
  for (let i = 0; i < mask.length; i++) if (mask[i]) img.data.fill(255, i * 4, i * 4 + 4);
  ctx.putImageData(img, 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  if (CACHE.size >= CACHE_MAX) {
    for (const t of CACHE.values()) t.destroy(true);
    CACHE.clear();
  }
  CACHE.set(key, texture);
  return texture;
}

export interface DitherVignetteOptions {
  /** The edge's colour (default black). */
  color?: number;
  /** How far from the centre toward a corner the edge begins, 0..1 (default 0.55). */
  from?: number;
}

/**
 * A dithered pixel edge round the screen, on the screen layer: a darkened border, or tinted red and beaten with
 * `heartbeat` while a player is low on health. The texture is made at full strength, off the frame that first needs
 * it (a full-screen dither is a few ms on a phone), and remade only when the window or the zoom changes; `show`
 * changes how much of it shows.
 */
export class DitherVignette {
  private readonly edge = new Sprite();
  private madeFor = '';
  private making: ReturnType<typeof setTimeout> | null = null;
  private readonly from: number;

  constructor(
    private readonly stage: Stage,
    options: DitherVignetteOptions = {},
  ) {
    this.from = options.from ?? 0.55;
    this.edge.tint = options.color ?? 0x000000;
    this.edge.visible = false;
    stage.screen.addChild(this.edge);
    this.making = setTimeout(() => {
      this.making = null;
      this.make();
    }, 0);
  }

  setColor(color: number): void {
    this.edge.tint = color;
  }

  private make(): void {
    if (this.edge.destroyed) return;
    const z = Math.max(1, this.stage.cameras.main.zoom);
    const w = this.stage.width / z;
    const h = this.stage.height / z;
    const key = `${Math.ceil(w)}x${Math.ceil(h)}`;
    if (key === this.madeFor) return;
    const tex = ditherVignette(w, h, 1, this.from);
    this.edge.texture = tex;
    // an empty texture leaves the size unmarked, so the next call asks again
    if (tex !== Texture.EMPTY) this.madeFor = key;
  }

  /** Shows the edge at `alpha` (0..1); call each frame it shows. */
  show(alpha: number): void {
    this.edge.visible = alpha > 0;
    if (!this.edge.visible) return;
    this.make();
    this.edge.alpha = alpha;
    this.edge.width = this.stage.width;
    this.edge.height = this.stage.height;
  }

  hide(): void {
    this.edge.visible = false;
  }

  destroy(): void {
    if (this.making) clearTimeout(this.making);
    this.edge.destroy();
  }
}
