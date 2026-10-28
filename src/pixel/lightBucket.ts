/**
 * Radii are painted at every second pixel up to 24 and every eighth above, so a shrinking flash reuses a few textures
 * (each new one is a canvas and an upload; one per pixel made the first flashes hitch).
 */
export const bucket = (r: number): number => (r <= 24 ? Math.max(2, Math.round(r / 2) * 2) : Math.round(r / 8) * 8);

/** How far a bucket lies from its larger neighbour: 2 px below 24, 8 px from 24 (whose next is 32). */
const stepAt = (b: number): number => (b < 24 ? 2 : 8);

/**
 * The bucket a light that changes slowly should take, given the one it took last (`prev`, 0 for none): it keeps that
 * one until the radius has moved three quarters of a step past it. A radius growing at dusk then takes each bucket
 * once; without it, a radius standing near the line between two buckets (or a clock nudged back a hair) drew the
 * light a whole step larger and smaller by turns, which read as the light blinking.
 */
export function stickyBucket(prev: number, r: number): number {
  if (prev > 0 && Math.abs(r - prev) < stepAt(prev) * 0.75) return prev;
  return bucket(r);
}
