import { batchFor, beginOutline, capturing, currentCoverage, dithered, endOutline, fillRuns, flushBatch, grade, pixelKey, ramp, record, stageRun } from './pixelTone';
import { PixelLayer } from '../core/PixelLayer';
import type { Graphics } from '../core/Graphics';

/*
 * Pixel painting shared by every kit's effects: every shape lands on the 1px world grid — the pixel size of the
 * character, prop and tile art, so an effect never looks chunkier than the body it sits on — and is redrawn at 12
 * frames per second. Every colour is pulled into the world's palette on the way out (`grade`). Shapes shade themselves from their colour's ramp (pixelTone.ts): rings are
 * brighter on the near side, thick arcs and discs carry a light edge and a deep underside, and strokes taper. Every
 * layer thins out with an ordered dither in its last frames instead of vanishing.
 */

export type Point = { x: number; y: number };
export const WHITE = 0xfff4d6;
export const snap = (n: number) => Math.round(n);

/** A `size`-px square (1 by default: one art pixel) on the world grid, graded into the world palette. */
export function dot(g: Graphics, x: number, y: number, color: number, size = 1): void {
  const px = snap(x);
  const py = snap(y);
  if (dithered(px, py)) return;
  const c = grade(color);
  if (capturing()) {
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) record(px + dx, py + dy, c);
    return;
  }
  const held = batchFor(g);
  if (held) {
    for (let dy = 0; dy < size; dy++) stageRun(held, px, py + dy, size, c);
    return;
  }
  g.fillStyle(c, 1).fillRect(px, py, size, size);
}

/**
 * Pixels a shape plots, the last plot of a pixel winning as it would on screen, laid when the shape is done as runs of
 * one tone (`fillRuns`) instead of a rect a pixel. A dither fade drops the same pixels `dot` would, and inside an
 * outline capture they are recorded like any `dot`.
 */
class Plot {
  private readonly at = new Map<number, number>();

  set(x: number, y: number, color: number): void {
    this.at.set(pixelKey(snap(x), snap(y)), color);
  }

  lay(g: Graphics): void {
    if (capturing()) {
      for (const [k, c] of this.at) dot(g, (k >>> 16) - 32768, (k & 0xffff) - 32768, c);
      return;
    }
    const held = batchFor(g);
    if (held instanceof PixelLayer) {
      // straight into the layer's staging: the keys are already one a pixel
      for (const [k, c] of this.at) {
        const x = (k >>> 16) - 32768;
        const y = (k & 0xffff) - 32768;
        if (!dithered(x, y)) held.stage(x, y, 1, grade(c));
      }
      return;
    }
    const graded = new Map<number, number>();
    for (const [k, c] of this.at) if (!dithered((k >>> 16) - 32768, (k & 0xffff) - 32768)) graded.set(k, grade(c));
    fillRuns(g, graded);
  }
}

/** A horizontal run of `w` px from (x, y), one pixel tall; drawn pixel by pixel while a dither fade or outline is on. */
export function hline(g: Graphics, x: number, y: number, w: number, color: number): void {
  const x0 = snap(x);
  const width = snap(w);
  if (width <= 0) return;
  if (!capturing() && !dithered(x0, y) && !dithered(x0 + 1, y) && !dithered(x0 + 2, y + 1) && !dithered(x0 + 3, y + 1)) {
    const held = batchFor(g);
    if (held) {
      stageRun(held, x0, snap(y), width, grade(color));
      return;
    }
    g.fillStyle(grade(color), 1).fillRect(x0, snap(y), width, 1);
    return;
  }
  for (let i = 0; i < width; i++) dot(g, x0 + i, y, color);
}

/** Paints `draw` with a dark 1px outline round everything it drew, like the outline on character and prop sprites. */
export function outlined(g: Graphics, outline: number, draw: () => void): void {
  beginOutline();
  try {
    draw();
  } finally {
    endOutline(g, outline);
  }
}

/**
 * A line `width` px thick built from 1px rows: the row on one side is lit, the far row deep, and a long stroke tapers
 * to the deep tone at both ends and catches a glint a third of the way along.
 */
export function stroke(g: Graphics, a: Point, b: Point, color: number, width = 2): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(len));
  const nx = len ? -(b.y - a.y) / len : 0;
  const ny = len ? (b.x - a.x) / len : 1;
  const r = ramp(color);
  const rows = Math.max(1, Math.round(width));
  for (let i = 0; i <= steps; i++) {
    const end = steps >= 10 && (i <= 1 || i >= steps - 1);
    const glint = steps >= 16 && Math.abs(i - Math.round(steps / 3)) <= 1;
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    for (let k = 0; k < rows; k++) {
      const off = k - (rows - 1) / 2;
      const edge = rows >= 2 ? (k === 0 ? r.light : k === rows - 1 ? r.deep : color) : color;
      dot(g, x + nx * off, y + ny * off, end ? r.deep : glint && k === 0 ? r.hi : edge);
    }
  }
}

/** A broken ellipse of radius `r` in the ground's 2:1 perspective, lit on the near side, turning with `phase`. */
export function ring(g: Graphics, r: number, color: number, phase = 0, cy = 0): void {
  const tones = ramp(color);
  const n = Math.max(32, Math.ceil(r * 5));
  const plot = new Plot();
  for (let i = 0; i < n; i++) {
    const seg = ((((i * 64) / n + phase) % 16) + 16) % 16;
    if (seg < 3) continue;
    const a = (i * Math.PI * 2) / n;
    const near = Math.sin(a);
    // the near side of the ellipse is lit and a pixel thicker; the far side sinks into the deep tone
    const tone = seg < 4 ? tones.hi : near > 0.35 ? tones.light : near < -0.35 ? tones.deep : color;
    const x = Math.cos(a) * r;
    const y = cy + near * r * 0.5;
    plot.set(x, y, tone);
    if (near > 0.5) plot.set(x, y + 1, tones.deep);
  }
  plot.lay(g);
}

/** A faceted gem: light left face, base right face, deep lower tip and a glint on top once it is big enough. */
export function diamond(g: Graphics, x: number, y: number, r: number, color: number): void {
  const tones = ramp(color);
  for (let row = -r; row <= r; row++) {
    const width = Math.max(1, snap(r - Math.abs(row)));
    const left = snap(x - width / 2);
    if (row > r * 0.45) {
      hline(g, left, y + row, width, tones.deep);
      continue;
    }
    const half = Math.floor(width / 2);
    if (r < 3 || half < 1) hline(g, left, y + row, width, color);
    else {
      hline(g, left, y + row, half, tones.light);
      hline(g, left + half, y + row, width - half, color);
    }
  }
  if (r >= 5) dot(g, x - 1, y - r + 2, tones.hi);
}

export function shards(g: Graphics, t: number, r: number, color: number, inward = false): void {
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6 + (inward ? t * 1.8 : 0);
    const d = r * (inward ? 1 - t : t);
    dot(g, Math.cos(a) * d, -8 + Math.sin(a) * d * 0.6 - (inward ? 0 : Math.sin(t * Math.PI) * 8), i % 3 ? color : WHITE, i % 3 ? 1 : 2);
  }
}

/** A filled stepped disc of radius `r` (smoke, gas, puddles), in the ground's 2:1 perspective when `flat`. */
export function blob(g: Graphics, x: number, y: number, r: number, color: number, flat = false): void {
  const ry = Math.max(1, Math.round(flat ? r * 0.5 : r));
  const tones = ramp(color);
  for (let row = -ry; row <= ry; row++) {
    const half = snap(r * Math.sqrt(Math.max(0, 1 - (row / ry) ** 2)));
    if (half <= 0) continue;
    const down = (row + ry) / (2 * ry || 1);
    hline(g, x - half, y + row, half * 2, down > 0.7 && r >= 3 ? tones.deep : color);
    // a lit cap on the upper left
    if (r >= 3 && down < 0.35 && half >= 2) hline(g, x - half + 1, y + row, snap(half * 0.6), tones.light);
  }
  if (r >= 4) dot(g, x - r * 0.4, y - ry * 0.55, tones.hi);
}

/** A droplet thrown from (x, y) with velocity (vx, vy) px/s under gravity, `ms` after it left; null once it lands. */
export function drop(x: number, y: number, vx: number, vy: number, ms: number, ground = y + 8): Point | null {
  const t = ms / 1000;
  const py = y + vy * t + 260 * t * t;
  return py > ground && vy * t + 260 * t * t > 0 ? null : { x: x + vx * t, y: py };
}

/** A pixel X, `r` from its centre to a tip. */
export function xMark(g: Graphics, x: number, y: number, r: number, color: number): void {
  stroke(g, { x: x - r, y: y - r }, { x: x + r, y: y + r }, color);
  stroke(g, { x: x - r, y: y + r }, { x: x + r, y: y - r }, color);
}

/** A dash streak from `a` to `b`: a dark body with a bright core, eaten away from the start as `t` goes 0 to 1. */
export function dashStreak(g: Graphics, a: Point, b: Point, t: number, edge: number, core: number): void {
  const from = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  stroke(g, from, b, edge, 4);
  stroke(g, from, b, core, 2);
}

/**
 * A puff of smoke or gas: a small stepped disc whose rim is dithered (every other pixel) so it reads soft, with a
 * lighter cap on its upper left. Solid discs the same size read as boulders or bushes.
 */
export function puffBlob(g: Graphics, x: number, y: number, r: number, body: number, light: number, frame = 0, opacity = 0.7): void {
  r = Math.round(r);
  if (r < 2) return;
  const tones = ramp(body);
  const ry = Math.max(2, Math.round(r * 0.85));
  // smoke is translucent: overlapping puffs thicken toward the middle of a cloud and the ground shows through its edge
  const alpha = opacity * currentCoverage();
  flushBatch();
  const x0 = snap(x);
  for (let row = -ry; row <= ry; row++) {
    const half = r * Math.sqrt(Math.max(0, 1 - (row / (ry + 0.5)) ** 2));
    // the same pixels as one rect each, laid as runs of one tone and alpha
    let runAt = 0;
    let runW = 0;
    let runTone = -1;
    let runAlpha = 0;
    const end = Math.ceil(half);
    for (let dx = -end; dx <= end; dx++) {
      let tone = -1;
      let a = 0;
      if (dx < end) {
        const edge = half - Math.abs(dx + 0.5);
        const noise = ((dx * 73856093) ^ (row * 19349663) ^ (frame * 83492791)) >>> 0;
        if (!(edge < 1 && noise % 2 === 0)) {
          const lit = row < -ry * 0.3 && dx < half * 0.2;
          tone = lit ? light : row > ry * 0.4 ? tones.deep : noise % 9 === 0 ? tones.light : body;
          a = edge < 1 ? alpha * 0.6 : alpha;
        }
      }
      if (tone === runTone && a === runAlpha && tone !== -1) {
        runW++;
        continue;
      }
      if (runTone !== -1) g.fillStyle(grade(runTone), runAlpha).fillRect(x0 + runAt, snap(y + row), runW, 1);
      runAt = dx;
      runW = 1;
      runTone = tone;
      runAlpha = a;
    }
  }
}

/** An arc of dots on an ellipse from angle `a0` to `a1` (flat: in the ground's 2:1 perspective), `thick` rows deep. */
export function arc(g: Graphics, x: number, y: number, r: number, a0: number, a1: number, color: number, flat = true, thick = 1): void {
  const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r));
  const tones = ramp(color);
  // `thick` counts the old 2px rows, so an arc keeps its weight; it is built from 1px rows
  thick *= 2;
  const plot = new Plot();
  for (let t = 0; t < thick; t++) {
    const rr = r - t;
    // a thick arc is lit on its outer edge and sinks to the deep tone inside; a thin one fades in from its tail
    const row = t === 0 ? tones.light : t === thick - 1 ? tones.deep : color;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      const tone = i >= steps - 1 ? tones.hi : thick <= 2 && steps >= 12 && i < steps * 0.2 ? tones.deep : row;
      plot.set(x + Math.cos(a) * rr, y + Math.sin(a) * rr * (flat ? 0.5 : 1), tone);
    }
  }
  plot.lay(g);
}

/** Pale stepped dust puffs kicked up around (x, y) and settling over `t` 0..1. */
export function dust(g: Graphics, x: number, y: number, t: number, spread = 10, color = 0xc8b89a): void {
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.3;
    const size = Math.round(4 * (1 - t));
    if (size >= 1) blob(g, x + Math.cos(a) * spread * t, y - 2 + Math.sin(a) * spread * 0.4 * t - t * 4, size, i % 2 ? color : 0xe0d4bc);
  }
}

/** Pixel chunks flung out of (x, y) under gravity (rock, splinters): `ms` after the blow. */
export function debris(g: Graphics, x: number, y: number, count: number, speed: number, ms: number, colors: number[]): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.3;
    const v = speed * (0.6 + ((i * 7) % 5) * 0.1);
    const p = drop(x, y, Math.cos(a) * v, -70 - ((i * 17) % 40), ms, y + 6);
    if (!p) continue;
    const c = colors[i % colors.length]!;
    const py = p.y + (Math.sin(a) * v * 0.3 * ms) / 1000;
    if (i % 3) dot(g, p.x, py, c);
    else {
      // a chunk: body, deep underside and a glint
      dot(g, p.x, py, c, 2);
      dot(g, p.x, py + 2, ramp(c).deep, 2);
      dot(g, p.x, py, ramp(c).hi);
    }
  }
}

