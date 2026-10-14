/*
 * How a swaying sprite is cut up, and how far each cut moves. Pure (no Pixi, no canvas), so it is unit-tested.
 *
 * A tree, a bush, a reed bank or a banner is never repainted to sway: its frame — painted or loaded alike — is sliced
 * into rects. The `pieces` stay where they are; each `strip` is the same pixels moved sideways by a whole number of
 * world pixels. The strips partition the moving region and the pieces partition the rest, so no pixel is ever drawn
 * twice and none is lost; a strip that moves one pixel leaves a one-pixel step against its neighbour, which is how a
 * pixel artist draws a bough bending. `SwayProp` puts a rig on screen.
 */

/**
 * - `crown`: a tree; the canopy above the trunk sways, the trunk found in the pixels (`trunkPivot`);
 * - `top`: the top `top` share of the frame sways (a bush, a reed clump);
 * - `hang`: a cloth hanging off a bar (`cloth`), each pair of rows swinging wider and later down it;
 * - `tufts`: only the given rects move (reeds painted into a bigger sprite), per variant.
 */
export type SwayMode = 'crown' | 'top' | 'hang' | 'tufts';

/** [x0, y0, x1, y1) in the frame's pixels, and an optional weight (share of the full reach, default 1). */
export type TuftRect = readonly [number, number, number, number] | readonly [number, number, number, number, number];

export interface SwayDef {
  mode: SwayMode;
  /** `top`: the share of the frame's height, from its top, that moves. */
  top?: number;
  /** `hang`: the cloth, [x0, y0, x1, y1) in the frame's pixels. */
  cloth?: readonly [number, number, number, number];
  /** `tufts`: the moving rects per variant ("*" for every variant without its own). */
  tufts?: Readonly<Record<string, readonly TuftRect[]>>;
  /** Whole world pixels of reach at wind 1. */
  amp: number;
  /** Sway cycles a second. */
  speed: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SwayStrip {
  rect: Rect;
  /** Share of the full reach this strip moves (the crown's top moves furthest, a banner's hem most). */
  weight: number;
  /** How far behind the top of the prop this strip swings, in cycles: the wave runs down a banner. */
  lag: number;
}

export interface SwayRig {
  pieces: Rect[];
  strips: SwayStrip[];
}

/**
 * The first row of a tree's trunk (the canopy is every row above it), from the width of the opaque run on each row
 * of its sprite (0 = empty). The trunk is the longest run of narrow rows in the lower part of the sprite, "narrow"
 * meaning within two pixels of the narrowest row there — so a root flare at the foot does not end it. Null when
 * the sprite has no trunk worth the name (a bush, a heap of reeds).
 */
export function trunkPivot(widths: readonly number[]): number | null {
  const n = widths.length;
  let minW = Infinity;
  for (let y = Math.floor(n * 0.4); y < n; y++) if (widths[y]! > 0) minW = Math.min(minW, widths[y]!);
  if (!Number.isFinite(minW)) return null;
  const lim = minW + 2;
  let best: [number, number] | null = null;
  let start = -1;
  for (let y = Math.floor(n * 0.3); y <= n; y++) {
    const narrow = y < n && widths[y]! > 0 && widths[y]! <= lim;
    if (narrow && start < 0) start = y;
    if (!narrow && start >= 0) {
      if (!best || y - start > best[1] - best[0]) best = [start, y];
      start = -1;
    }
  }
  if (!best || best[1] - best[0] < 3) return null;
  let crown = 0;
  for (let y = 0; y < best[0]; y++) crown = Math.max(crown, widths[y]!);
  return crown >= lim * 1.5 ? best[0] : null;
}

/** A row band split in two: the top moving full reach, the lower half-way. One band when it is short. */
function bands(from: number, to: number, w: number): SwayStrip[] {
  const h = to - from;
  if (h <= 0) return [];
  if (h < 20) return [{ rect: { x: 0, y: from, w, h }, weight: 1, lag: 0 }];
  const split = from + Math.round(h * 0.5);
  return [
    { rect: { x: 0, y: from, w, h: split - from }, weight: 1, lag: 0 },
    { rect: { x: 0, y: split, w, h: to - split }, weight: 0.55, lag: 0.04 },
  ];
}

/**
 * The frame `w`x`h` less the given rects (which must not overlap), as rects: cut into row bands at every rect's
 * top and bottom, and each band into the runs no rect covers.
 */
export function complement(w: number, h: number, holes: Rect[]): Rect[] {
  const ys = [...new Set([0, h, ...holes.flatMap((r) => [r.y, r.y + r.h])])].filter((y) => y >= 0 && y <= h).sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let i = 0; i + 1 < ys.length; i++) {
    const y = ys[i]!;
    const bh = ys[i + 1]! - y;
    const cover = holes.filter((r) => r.y <= y && r.y + r.h >= y + bh).sort((a, b) => a.x - b.x);
    let x = 0;
    for (const r of cover) {
      if (r.x > x) out.push({ x, y, w: r.x - x, h: bh });
      x = Math.max(x, r.x + r.w);
    }
    if (x < w) out.push({ x, y, w: w - x, h: bh });
  }
  // the biggest still piece first: it becomes the placed image the map culls and fades
  return out.sort((a, b) => b.w * b.h - a.w * a.h);
}

/** The tuft rects of one variant (its own list, else the "*" one), clipped to the frame. */
function tuftStrips(def: SwayDef, w: number, h: number, variant: number): SwayStrip[] {
  const list = def.tufts?.[String(variant)] ?? def.tufts?.['*'] ?? [];
  const strips: SwayStrip[] = [];
  for (const [x0, y0, x1raw, y1raw, weight = 1] of list) {
    const x1 = Math.min(w, x1raw);
    const y1 = Math.min(h, y1raw);
    if (x1 <= x0 || y1 <= y0) continue;
    // a reed's lower half follows its tip a beat late
    strips.push({ rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, weight, lag: (1 - weight) * 0.08 });
  }
  return strips;
}

/**
 * The rig for one prop frame `w`x`h`. `rowWidths` is only read by a `crown`, whose pivot comes from the pixels
 * (without it, or without a trunk in them, the crown falls back to the top 60%). `variant` is only read by
 * `tufts`, whose rects are drawn per variant.
 */
export function buildRig(def: SwayDef, w: number, h: number, rowWidths?: readonly number[], variant = 0): SwayRig {
  if (def.mode === 'tufts') {
    const strips = tuftStrips(def, w, h, variant);
    return { pieces: strips.length ? complement(w, h, strips.map((s) => s.rect)) : [], strips };
  }
  if (def.mode === 'hang' && def.cloth) {
    const [x0, y0, x1raw, y1raw] = def.cloth;
    const x1 = Math.min(w, x1raw);
    const y1 = Math.min(h, y1raw);
    // the top third of the cloth hangs straight off its bar; below that each pair of rows swings wider
    const ys = y0 + Math.round((y1 - y0) * 0.3);
    const strips: SwayStrip[] = [];
    for (let y = ys; y < y1; y += 2) {
      const sh = Math.min(2, y1 - y);
      strips.push({ rect: { x: x0, y, w: x1 - x0, h: sh }, weight: (y + sh - ys) / (y1 - ys), lag: (y - ys) * 0.03 });
    }
    const pieces: Rect[] = [
      { x: 0, y: 0, w, h: ys },
      { x: 0, y: y1, w, h: h - y1 },
      { x: 0, y: ys, w: x0, h: y1 - ys },
      { x: x1, y: ys, w: w - x1, h: y1 - ys },
    ].filter((r) => r.w > 0 && r.h > 0);
    return { pieces, strips };
  }
  let pivot: number | null = null;
  if (def.mode === 'crown' && rowWidths) pivot = trunkPivot(rowWidths);
  if (pivot === null) pivot = Math.round(h * Math.min(0.9, def.mode === 'top' ? (def.top ?? 0.5) : 0.6));
  pivot = Math.max(1, Math.min(h - 1, pivot));
  return { pieces: [{ x: 0, y: pivot, w, h: h - pivot }], strips: bands(0, pivot, w) };
}

/** A stable [0, 1) per tile (or any two integers), so each prop keeps its own phase and pace from one visit to the next. */
export function tileHash(tx: number, ty: number, salt = 0): number {
  let h = Math.imul(tx + 0x9e37, 0x85ebca6b) ^ Math.imul(ty + 0x79b9 + salt * 131, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** A gust rolling across the world from the west: every tree it passes bends a little further, then less. */
export function gustAt(tSec: number, worldX: number, gustSeconds: number, gustPx: number): number {
  return 0.65 + 0.35 * Math.sin(2 * Math.PI * (tSec / gustSeconds - worldX / gustPx));
}

/**
 * How many whole pixels a strip stands off at `tSec`: a main swing with a slower second one riding it (so no two
 * trees ever meet in step), leaning a little downwind as the wind rises, scaled by the reach, the wind, the gust
 * and the strip's weight, and rounded — the sway moves in pixel steps, 0 → 1 → 0, never smeared between them.
 *
 * `minReach` is the least that reach × wind × gust may come to while any wind blows (a still place's
 * floor, chosen by the game): without it a faint breeze never rounds to a whole pixel and the trees stand dead still, and
 * rounding is the rule, so the floor is what lets the crest of a swing tick one pixel over and back.
 */
export function swayOffset(
  tSec: number,
  speed: number,
  phase: number,
  lag: number,
  amp: number,
  wind: number,
  gust: number,
  weight: number,
  minReach = 0,
): number {
  if (wind <= 0) return 0;
  const c = tSec * speed + phase - lag;
  const wave = 0.3 * wind + 0.72 * Math.sin(2 * Math.PI * c) + 0.28 * Math.sin(2 * Math.PI * (c * 0.43 + phase * 1.7));
  const reach = Math.max(amp * wind * gust, minReach);
  const v = Math.round(reach * weight * wave);
  return v === 0 ? 0 : v;
}
