import type { Graphics } from '../core/Graphics';
import { dot } from './pixelPaint';
import { ramp } from './pixelTone';

/*
 * Particles and flight frames for pixel effects: twinkling sparks, shaded trails, and art pixels placed along a
 * projectile's heading. Each shades itself from its colour's ramp (`ramp`), so a game hands in only a colour.
 * Re-exported by `pixelPaint`.
 */

/**
 * A spark of `size` 1 (one pixel, glinting every third `frame`), 2 (a plus with a lit centre) or 3 (a four-point star
 * whose arms twinkle with `frame`), shaded from `color`'s ramp, on the 1-px world grid.
 */
export function spark(g: Graphics, x: number, y: number, color: number, size: 1 | 2 | 3, frame = 0): void {
  const r = ramp(color);
  if (size === 1) return dot(g, x, y, frame % 3 === 0 ? r.light : color);
  dot(g, x, y, r.hi);
  const arm = size === 3 ? 2 + (frame % 2) : 1;
  for (let d = 1; d <= arm; d++) {
    const c = d === arm && arm > 1 ? r.deep : d === 1 ? r.light : color;
    dot(g, x + d, y, c);
    dot(g, x - d, y, c);
    dot(g, x, y + d, c);
    dot(g, x, y - d, c);
  }
}

/**
 * A particle's trail: `len` px back from its head (x, y) against its velocity (vx, vy), glint to shade, its far half
 * broken into every other pixel. `thick` 2 lays a second row under it on the shaded side (down, or right for a trail
 * running straight up or down) a tone deeper, so the trail has a body; 3 adds a lit row on the up-left side over its
 * near half. Light comes from the up-left, as on the rest of the art.
 */
export function tail(g: Graphics, x: number, y: number, vx: number, vy: number, len: number, color: number, thick = 1): void {
  const n = Math.hypot(vx, vy);
  if (n === 0) return dot(g, x, y, color);
  const r = ramp(color);
  const tones = [r.hi, r.light, color, color, r.deep, r.shade];
  const steps = Math.max(1, Math.floor(len));
  // the shaded side: perpendicular to the flight, pointing down (or right when the flight is vertical)
  let sx = -vy / n;
  let sy = vx / n;
  if (sy < -0.1 || (Math.abs(sy) <= 0.1 && sx < 0)) {
    sx = -sx;
    sy = -sy;
  }
  const ox = Math.round(sx);
  const oy = Math.round(sy) || (ox === 0 ? 1 : 0);
  for (let i = steps; i >= 0; i--) {
    const k = i / steps;
    if (k > 0.5 && i % 2) continue;
    const px = x - (vx / n) * i;
    const py = y - (vy / n) * i;
    const tone = Math.min(tones.length - 1, Math.floor(k * tones.length));
    if (thick >= 2 && k < 0.8) dot(g, px + ox, py + oy, tones[Math.min(tones.length - 1, tone + 1)]!);
    if (thick >= 3 && k < 0.45) dot(g, px - ox, py - oy, tones[Math.max(0, tone - 1)]!);
    dot(g, px, py, tones[tone]!);
  }
}

/** Paints one art pixel at (along, across) in the frame of a line through a point, heading an angle. */
export type FlightPixel = (along: number, across: number, color: number) => void;

/**
 * A painter for a projectile drawn the size it really hits at: pixels are given along its heading and across it
 * (positive across is to the right of the heading), rotated onto the world grid at (x, y). Make one per frame painted.
 */
export function pixelOn(g: Graphics, x: number, y: number, angle: number): FlightPixel {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (along, across, color) => dot(g, x + c * along - s * across, y + s * along + c * across, color);
}
