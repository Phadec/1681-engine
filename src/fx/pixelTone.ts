import type { Graphics } from '../core/Graphics';
import { PixelLayer } from '../core/PixelLayer';

/*
 * Colour ramps and ordered dithering for the pixel effects. A ramp turns one colour into five tones the way pixel
 * artists shade: shadows shift toward blue-violet and lose saturation, highlights shift toward yellow. The dither fade
 * drops pixels in a 4x4 Bayer order, so an effect thins out pixel by pixel instead of vanishing in one frame.
 */

interface Ramp {
  /** Darkest: under-shade and outline pixels. */
  shade: number;
  deep: number;
  base: number;
  light: number;
  /** Near-white glint. */
  hi: number;
}

const RAMPS = new Map<number, Ramp>();

function toHsl(c: number): [number, number, number] {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): number {
  const hue = (p: number, q: number, t: number) => {
    const u = (t + 1) % 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => Math.round(Math.max(0, Math.min(1, s === 0 ? l : hue(p, q, t))) * 255);
  return (ch(h + 1 / 3) << 16) | (ch(h) << 8) | ch(h - 1 / 3);
}

/** Hue moved `amount` (turns) toward `target`, the short way round. */
function drift(h: number, target: number, amount: number): number {
  let d = target - h;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return (h + Math.sign(d) * Math.min(Math.abs(d), amount) + 1) % 1;
}

/**
 * Ramps picked by hand for the colours the kits are built on — a kit module paints its crescents, rings and trails in
 * one material colour and lets the shapes shade themselves, so without these every shade of a kit was the formula's
 * . `ramp` of one of these colours returns its hand ramp; every other colour
 * gets `derivedRamp`. `base` is always the colour itself.
 */
const HAND_RAMPS = new Map<number, Omit<Ramp, 'base'>>([
  // arcane violet
  [0xc8a0ff, { hi: 0xfbf0ff, light: 0xe6cdfc, deep: 0x8456c8, shade: 0x3e2466 }],
  // straw and bone (the hunters' arrows)
  [0xe8d8a0, { hi: 0xfffbe8, light: 0xf6ecc4, deep: 0xb09a62, shade: 0x5a4a30 }],
  // dusk violet
  [0xb070ff, { hi: 0xf4e6ff, light: 0xd4b0ff, deep: 0x7040b8, shade: 0x301a5a }],
  // cold sky steel
  [0x9fe6ff, { hi: 0xf4fcff, light: 0xd0f4ff, deep: 0x5a9ac8, shade: 0x243e6a }],
  // bright steel
  [0xe0e0f0, { hi: 0xffffff, light: 0xf2f2fa, deep: 0x9a9cb6, shade: 0x4a4a64 }],
  // wind over grass
  [0xa8f0c0, { hi: 0xf0fff4, light: 0xd4fae0, deep: 0x5eb088, shade: 0x245a46 }],
  // holy gold
  [0xffd98a, { hi: 0xfffbe6, light: 0xffecb8, deep: 0xc8963e, shade: 0x6a4424 }],
  // judgement gold
  [0xffe08a, { hi: 0xfffbe2, light: 0xfff0bc, deep: 0xd0a044, shade: 0x704a22 }],
  // trap amber
  [0xffc040, { hi: 0xfff4d0, light: 0xffe090, deep: 0xc07a20, shade: 0x6a3a16 }],
  // hunter's gold
  [0xd0b070, { hi: 0xfff6dc, light: 0xecd6a0, deep: 0x8e7040, shade: 0x4a3a24 }],
  // war-cry amber
  [0xffb13b, { hi: 0xfff0cc, light: 0xffd488, deep: 0xc0701e, shade: 0x683414 }],
  // moonlit silver-blue
  [0xa0b0ff, { hi: 0xf2f4ff, light: 0xd0d8ff, deep: 0x5e6ac8, shade: 0x2a2e6a }],
  // blood
  [0xff4a3a, { hi: 0xffe0d4, light: 0xff9a86, deep: 0xa81e22, shade: 0x4e0c16 }],
  // pale violet steel
  [0xe0d0ff, { hi: 0xfbf6ff, light: 0xf0e8ff, deep: 0x9a86c8, shade: 0x4a3a6e }],
]);

const HAND = new Map<number, Ramp>([...HAND_RAMPS].map(([c, r]) => [c, { ...r, base: c }]));

export function ramp(color: number): Ramp {
  return HAND.get(color) ?? derivedRamp(color);
}

/** The formula's five tones for any colour: shadows cool and desaturate, highlights warm. */
export function derivedRamp(color: number): Ramp {
  let r = RAMPS.get(color);
  if (r) return r;
  const [h, s, l] = toHsl(color);
  const cool = drift(h, 0.72, 0.06);
  const warm = drift(h, 0.14, 0.04);
  r = {
    shade: fromHsl(cool, Math.min(1, s * 0.85), Math.max(0.08, l * 0.38)),
    deep: fromHsl(drift(h, 0.72, 0.03), s, Math.max(0.14, l * 0.66)),
    base: color,
    light: fromHsl(warm, s * 0.9, Math.min(0.9, l + (1 - l) * 0.45)),
    hi: fromHsl(warm, s * 0.5, Math.min(0.97, l + (1 - l) * 0.8)),
  };
  RAMPS.set(color, r);
  return r;
}

const GRADED = new Map<number, number>();

/**
 * The colour a pixel is actually painted with: effects are authored in bright, saturated colours, and this pulls them
 * into the world's palette (muted earth, grass and wood) — saturation down by a quarter, near-whites toned down and
 * warmed, so an effect sits in the scene instead of glowing on top of it. Glints keep most of their lift.
 */
export function grade(color: number): number {
  let out = GRADED.get(color);
  if (out !== undefined) return out;
  const [h, s, l] = toHsl(color);
  const lift = l > 0.82 ? 0.82 + (l - 0.82) * 0.55 : l;
  out = fromHsl(l > 0.82 ? drift(h, 0.12, 0.05) : h, s * (l > 0.82 ? 0.55 : 0.74), lift * 0.97);
  GRADED.set(color, out);
  return out;
}

/*
 * Outline capture: while one is open, `dot` and `hline` record pixels instead of painting them, and `endOutline`
 * paints a dark 1px rim round the recorded silhouette before the pixels themselves — the same outline the character
 * and prop sprites carry, for effects that have a shape (a shield, a skull, a flask, a bolt).
 */
let capture: Map<number, number> | null = null;
const key = (x: number, y: number) => ((x + 32768) << 16) | ((y + 32768) & 0xffff);

export function capturing(): Map<number, number> | null {
  return capture;
}

/** The four sides a rim pixel may lie on, as dx, dy pairs. */
const RIM_STEPS = [1, 0, -1, 0, 0, 1, 0, -1];

export function beginOutline(): void {
  capture = new Map();
}

export function endOutline(g: Graphics, outline: number): void {
  const pixels = capture;
  capture = null;
  if (!pixels) return;
  // each rim pixel once, however many silhouette pixels it touches
  const rim = new Set<number>();
  for (const k of pixels.keys()) {
    const x = (k >>> 16) - 32768;
    const y = (k & 0xffff) - 32768;
    for (let i = 0; i < 8; i += 2) {
      const n = key(x + RIM_STEPS[i]!, y + RIM_STEPS[i + 1]!);
      if (!pixels.has(n)) rim.add(n);
    }
  }
  const ink = grade(outline);
  fillRuns(g, new Map([...rim].map((k) => [k, ink])));
  fillRuns(g, pixels);
}

/**
 * Lays pixels (keyed by `key`, each with its colour already graded) row by row, one rect for every run of one colour:
 * the same pixels as one rect each, at a fraction of the rects (single-pixel rects ran to 5,000–9,000 a frame for one
 * big ring or smoke, enough to be felt as lag).
 */
export function fillRuns(g: Graphics, pixels: Map<number, number>): void {
  if (batchG !== null && g === batchG) {
    if (direct) for (const [k, c] of pixels) direct.stage((k >>> 16) - 32768, (k & 0xffff) - 32768, 1, c);
    else for (const [k, c] of pixels) batch!.set(k, c);
    return;
  }
  layRuns(g, pixels);
}

/*
 * A frame's batch (`beginBatch` / `endBatch`): while one is open every solid pixel `dot`, `hline` and `fillRuns` paint goes into it,
 * the last write of a pixel winning as it would on screen, and it is laid as runs when the frame is done — so an
 * effect that plots a pixel at a time costs a rect a run, not a rect a pixel. A translucent fill (smoke, a heat wash)
 * calls `flushBatch` first, so what was painted before it stays under it.
 *
 * On a `PixelLayer` the batch is the layer's own staging: each pixel goes
 * straight into its list in the order painted and `commit` lays them, the later winning — the same pixels the map,
 * its sort and its runs gave, without them. Any other Graphics keeps the map.
 */
let batch: Map<number, number> | null = null;
let direct: PixelLayer | null = null;
let batchG: Graphics | null = null;
/** Batches opened under this one (a layer painted from inside another's paint), each laid and closed on its own. */
const outer: { batch: Map<number, number> | null; direct: PixelLayer | null; g: Graphics | null }[] = [];

export function beginBatch(g: Graphics): void {
  outer.push({ batch, direct, g: batchG });
  if (g instanceof PixelLayer) {
    batch = null;
    direct = g;
  } else {
    batch = new Map();
    direct = null;
  }
  batchG = g;
}

export function endBatch(): void {
  flushBatch();
  const was = outer.pop();
  batch = was?.batch ?? null;
  direct = was?.direct ?? null;
  batchG = was?.g ?? null;
}

/**
 * Where a solid pixel painted on `g` goes while its batch is open: the layer's staging, the batch's map, or nowhere
 * (paint it now). `stagePixel` writes into whichever it is.
 */
export function batchFor(g: Graphics): Map<number, number> | PixelLayer | null {
  if (batchG === null || g !== batchG) return null;
  return direct ?? batch;
}

/** Writes a solid run of `w` pixels at (x, y) into what `batchFor` returned. */
export function stageRun(held: Map<number, number> | PixelLayer, x: number, y: number, w: number, color: number): void {
  if (held instanceof PixelLayer) {
    held.stage(x, y, w, color);
    return;
  }
  for (let i = 0; i < w; i++) held.set(key(x + i, y), color);
}

/** Lays what the batch holds now, so a translucent fill that follows lies over it. */
export function flushBatch(): void {
  if (direct) {
    direct.commit();
    return;
  }
  if (!batch || !batchG || batch.size === 0) return;
  const held = batch;
  batch = new Map();
  layRuns(batchG, held);
}

function layRuns(g: Graphics, pixels: Map<number, number>): void {
  if (g instanceof PixelLayer) {
    // the layer lays its own runs; nothing between here and its commit is drawn
    for (const [k, c] of pixels) g.stage((k >>> 16) - 32768, (k & 0xffff) - 32768, 1, c);
    g.commit();
    return;
  }
  const keys = [...pixels.keys()].sort((a, b) => (a & 0xffff) - (b & 0xffff) || (a >>> 16) - (b >>> 16));
  let runX = 0;
  let runY = 0;
  let runW = 0;
  let runC = -1;
  for (const k of keys) {
    const x = (k >>> 16) - 32768;
    const y = (k & 0xffff) - 32768;
    const c = pixels.get(k)!;
    if (runW > 0 && y === runY && x === runX + runW && c === runC) {
      runW++;
      continue;
    }
    if (runW > 0) g.fillStyle(runC, 1).fillRect(runX, runY, runW, 1);
    runX = x;
    runY = y;
    runW = 1;
    runC = c;
  }
  if (runW > 0) g.fillStyle(runC, 1).fillRect(runX, runY, runW, 1);
}

/** The key `capturing()` and `fillRuns` file a world pixel under. */
export function pixelKey(x: number, y: number): number {
  return key(x, y);
}

export function record(x: number, y: number, color: number): void {
  capture?.set(key(x, y), color);
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** 1 draws every pixel, 0 none; set around each paint so every shape thins out together. */
let coverage = 1;

export function setCoverage(value: number): void {
  coverage = value;
}

/** The current dither fade (1 while nothing fades), for translucent fills that fade with their layer. */
export function currentCoverage(): number {
  return coverage;
}

/** Whether the world pixel at (x, y) is dropped by the current dither fade. */
export function dithered(x: number, y: number): boolean {
  if (coverage >= 1) return false;
  const cx = (Math.round(x) & 3) >>> 0;
  const cy = (Math.round(y) & 3) >>> 0;
  return BAYER[cy * 4 + cx]! / 16 >= coverage;
}
