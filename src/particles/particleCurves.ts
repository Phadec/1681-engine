/**
 * Values that change over a particle's life, sampled at `t` from 0 (born) to 1 (gone). A curve is one of:
 *
 * - a number: the same the whole life;
 * - `{ start, end }`: a straight line between the two;
 * - keyframes `[[t, value], …]` sorted by `t`: straight lines between them, held flat before the first and after
 *   the last (a puff that swells fast then fades slowly is three keys, not a custom function).
 *
 * Pure and allocation-free: an emitter samples three curves per particle per frame.
 */
export type Curve = number | { readonly start: number; readonly end: number } | readonly (readonly [t: number, value: number])[];

/** The same three shapes for colours (`0xrrggbb`), blended channel by channel. */
export type ColorCurve = Curve;

export function sampleCurve(curve: Curve, t: number): number {
  if (typeof curve === 'number') return curve;
  if (!isKeys(curve)) return curve.start + (curve.end - curve.start) * clamp01(t);
  const n = curve.length;
  if (n === 0) return 0;
  const first = curve[0]!;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < n; i++) {
    const b = curve[i]!;
    if (t <= b[0]) {
      const a = curve[i - 1]!;
      const span = b[0] - a[0];
      return span <= 0 ? b[1] : a[1] + (b[1] - a[1]) * ((t - a[0]) / span);
    }
  }
  return curve[n - 1]![1];
}

export function sampleColor(curve: ColorCurve, t: number): number {
  if (typeof curve === 'number') return curve;
  if (!isKeys(curve)) return lerpColor(curve.start, curve.end, clamp01(t));
  const n = curve.length;
  if (n === 0) return 0xffffff;
  const first = curve[0]!;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < n; i++) {
    const b = curve[i]!;
    if (t <= b[0]) {
      const a = curve[i - 1]!;
      const span = b[0] - a[0];
      return span <= 0 ? b[1] : lerpColor(a[1], b[1], (t - a[0]) / span);
    }
  }
  return curve[n - 1]![1];
}

/** Two `0xrrggbb` colours mixed per channel, each channel rounded to a whole value. */
export function lerpColor(a: number, b: number, t: number): number {
  const k = clamp01(t);
  const r = Math.round(((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * k);
  const g = Math.round(((a >> 8) & 0xff) + (((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * k);
  const bl = Math.round((a & 0xff) + ((b & 0xff) - (a & 0xff)) * k);
  return (r << 16) | (g << 8) | bl;
}

function isKeys(c: Exclude<Curve, number>): c is readonly (readonly [number, number])[] {
  return Array.isArray(c);
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
