/** A number picked at random between two (inclusive of the first), or a fixed one. */
export type Range = number | readonly [min: number, max: number];

/** A value of `range` for one random draw `r` in [0, 1). */
export function sampleRange(range: Range, r: number): number {
  if (typeof range === 'number') return range;
  return range[0] + (range[1] - range[0]) * r;
}

/** `base` turned by up to `spread` either way: `r` 0 gives `base - spread`, 0.5 gives `base`. */
export function spreadAngle(base: number, spread: number, r: number): number {
  return base + (r * 2 - 1) * spread;
}

/**
 * Whole particles due after `dt` seconds at `rate` a second, given the fraction `carry` left over from before. Kept
 * as a fraction rather than rounded each frame, or 30 a second at 144 fps (0.21 a frame) would emit none at all.
 * Returns the count in the integer part and the new carry in the fraction: `n = Math.floor(v)`, `carry = v - n`.
 */
export function dueParticles(rate: number, dt: number, carry: number): number {
  if (!(rate > 0) || !(dt > 0)) return carry;
  return carry + rate * dt;
}

/**
 * `n` scaled by `factor` (reduced effects), rounded at random so a burst of 3 at 0.35 still gives one particle about
 * every time rather than never: the expected count stays `n × factor`.
 */
export function scaleCount(n: number, factor: number, r: number): number {
  if (factor >= 1) return n;
  const v = n * Math.max(0, factor);
  const whole = Math.floor(v);
  return whole + (r < v - whole ? 1 : 0);
}

/** A small seedable generator (mulberry32) for tests and replays; the emitter takes any `() => number`. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
