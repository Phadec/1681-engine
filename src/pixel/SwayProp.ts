import { Rectangle, Sprite, Texture, type TextureSource } from 'pixi.js';
import type { Image } from '../core/Image';
import { buildRig, gustAt, swayOffset, type Rect, type SwayDef, type SwayRig } from './swayRig';

/** Sub-textures, one per (frame, rect), shared by every prop cut from the same source. */
const SLICES = new WeakMap<TextureSource, Map<string, Texture>>();

function slice(frame: Texture, r: Rect): Texture {
  let cache = SLICES.get(frame.source);
  if (!cache) SLICES.set(frame.source, (cache = new Map()));
  const f = frame.frame;
  const k = `${f.x + r.x},${f.y + r.y},${r.w},${r.h}`;
  let t = cache.get(k);
  if (!t) cache.set(k, (t = new Texture({ source: frame.source, frame: new Rectangle(f.x + r.x, f.y + r.y, r.w, r.h) })));
  return t;
}

/**
 * The opaque width of each row of a frame, read once off its canvas (a `crown` finds its trunk in them); undefined
 * when the source is not a 2D canvas. The atlas pages are canvases kept on the CPU, so this costs no GPU read-back.
 */
export function opaqueRowWidths(frame: Texture): number[] | undefined {
  const canvas = frame.source.resource as HTMLCanvasElement | undefined;
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return undefined;
  const { x, y, width: w, height: h } = frame.frame;
  const data = ctx.getImageData(x, y, w, h).data;
  const out: number[] = [];
  for (let row = 0; row < h; row++) {
    let l = -1;
    let r = -1;
    for (let col = 0; col < w; col++)
      if (data[(row * w + col) * 4 + 3]! > 0) {
        if (l < 0) l = col;
        r = col;
      }
    out.push(l < 0 ? 0 : r - l + 1);
  }
  return out;
}

export interface SwayPropOptions {
  /** Which `tufts` list to read (default 0). */
  variant?: number;
  /** This prop's place in the cycle, 0..1 (`tileHash` of its tile keeps it from one visit to the next). */
  phase?: number;
  /** Its pace against the def's `speed` (default 1): a little apart per prop, so a wood never sways in step. */
  pace?: number;
  /** Row widths for a `crown` (default: read off the frame with `opaqueRowWidths`). */
  rowWidths?: readonly number[];
  /** A rig already built for this frame (props of one frame share one). */
  rig?: SwayRig;
}

export interface SwayWind {
  /** 0 still … 1 a full wind. */
  wind: number;
  /** A gust's period (s) and wavelength across the world (px); see `gustAt`. */
  gustSeconds: number;
  gustPx: number;
  /** The least reach while any wind blows (`swayOffset`). */
  minReach?: number;
}

/**
 * One sprite swaying in the wind, in whole world pixels. The placed image becomes the rig's first (largest) still
 * piece — so whatever culls, fades or sorts it keeps working — and the other pieces and the strips are sprites beside
 * it in the same parent, at its depth, following its visibility and alpha. A strip's sprite is moved only when its
 * whole-pixel offset changes.
 */
export class SwayProp {
  private readonly parts: Sprite[] = [];
  private readonly strips: { sprite: Sprite; homeX: number; weight: number; lag: number; offset: number }[] = [];
  private readonly phase: number;
  private readonly speed: number;
  private shown: boolean;
  private alpha: number;
  /** False when the frame is too small or the rig has nothing to move: `update` then does nothing. */
  readonly active: boolean;

  constructor(
    private readonly img: Image,
    private readonly def: SwayDef,
    options: SwayPropOptions = {},
  ) {
    this.phase = options.phase ?? 0;
    this.speed = def.speed * (options.pace ?? 1);
    this.shown = img.visible;
    this.alpha = img.alpha;
    const frame = img.texture;
    const w = frame.frame.width;
    const h = frame.frame.height;
    const parent = img.parent;
    const rig =
      options.rig ?? (w >= 2 && h >= 2 ? buildRig(def, w, h, def.mode === 'crown' ? (options.rowWidths ?? opaqueRowWidths(frame)) : undefined, options.variant ?? 0) : null);
    this.active = !!rig && !!parent && rig.pieces.length > 0 && rig.strips.length > 0;
    if (!this.active || !rig || !parent) return;
    const ax = img.anchor.x * w;
    const ay = img.anchor.y * h;
    const left = Math.round(img.x - ax);
    const top = Math.round(img.y - ay);
    const [first, ...rest] = rig.pieces;
    img.texture = slice(frame, first!);
    img.anchor.set((ax - first!.x) / first!.w, (ay - first!.y) / first!.h);
    const add = (r: Rect): Sprite => {
      const s = new Sprite(slice(frame, r));
      s.position.set(left + r.x, top + r.y);
      s.zIndex = img.zIndex;
      s.visible = img.visible;
      s.alpha = img.alpha;
      parent.addChild(s);
      this.parts.push(s);
      return s;
    };
    for (const r of rest) add(r);
    for (const st of rig.strips) this.strips.push({ sprite: add(st.rect), homeX: left + st.rect.x, weight: st.weight, lag: st.lag, offset: 0 });
  }

  /** `tSec` seconds of any steady clock; `enabled` false stands everything still (an ambient-effects setting). */
  update(tSec: number, air: SwayWind, enabled = true): void {
    if (!this.active) return;
    const shown = this.img.visible;
    if (shown !== this.shown) {
      this.shown = shown;
      for (const p of this.parts) p.visible = shown;
    }
    if (!shown) return;
    if (this.img.alpha !== this.alpha) {
      this.alpha = this.img.alpha;
      for (const p of this.parts) p.alpha = this.alpha;
    }
    const still = !enabled || air.wind <= 0;
    const gust = still ? 0 : gustAt(tSec, this.img.x, air.gustSeconds, air.gustPx);
    for (const st of this.strips) {
      const off = still ? 0 : swayOffset(tSec, this.speed, this.phase, st.lag, this.def.amp, air.wind, gust, st.weight, air.minReach ?? 0);
      if (off === st.offset) continue;
      st.offset = off;
      st.sprite.x = st.homeX + off;
    }
  }

  destroy(): void {
    for (const p of this.parts) p.destroy();
    this.parts.length = 0;
    this.strips.length = 0;
  }
}
