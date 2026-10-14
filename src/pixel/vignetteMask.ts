/**
 * The pure half of `DitherVignette`: which pixels of a `w`×`h` screen (in world pixels) the edge sets, its falloff an
 * ordered 4×4 Bayer dither rather than a gradient — the grammar `Darkness` lights the night in, so the edge reads as
 * pixel art and not as a blur over it.
 */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** How strongly a pixel `d` of the way from the centre to the corner is darkened: 0 inside `from`, 1 at the corner. */
function edge(d: number, from: number): number {
  if (d <= from) return 0;
  const t = Math.min(1, (d - from) / (1 - from));
  return t * t;
}

/**
 * One byte a pixel, 1 where the edge is set. `strength` (0..1) is the share of pixels set at the very corner; `from`
 * (0..1) is how far from the centre toward a corner the edge begins.
 */
export function vignetteMask(w: number, h: number, strength: number, from = 0.55): Uint8Array {
  const tw = Math.max(1, Math.ceil(w));
  const th = Math.max(1, Math.ceil(h));
  const out = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      const dx = (x + 0.5) / tw - 0.5;
      const dy = (y + 0.5) / th - 0.5;
      // squared distance against squared bounds: no root for the many pixels inside `from`
      const d2 = (dx * dx + dy * dy) * 2;
      if (d2 <= from * from) continue;
      if (edge(Math.sqrt(d2), from) * strength <= BAYER[(y & 3) * 4 + (x & 3)]!) continue;
      out[y * tw + x] = 1;
    }
  return out;
}

/**
 * A pulse's opacity at `now` (ms): a quick rise and a slower fall, a beat every `slowMs` at `urgency` 0 quickening to
 * every `fastMs` at 1, deeper as it quickens, in `steps` levels rather than a smooth swell (0 for smooth).
 */
export function heartbeat(now: number, urgency: number, steps = 6, slowMs = 1000, fastMs = 500): number {
  const u = Math.max(0, Math.min(1, urgency));
  const period = slowMs - u * (slowMs - fastMs);
  const t = (((now % period) + period) % period) / period;
  const beat = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.55);
  const v = (0.35 + u * 0.4) * (0.45 + 0.55 * beat);
  return steps > 0 ? Math.round(v * steps) / steps : v;
}
