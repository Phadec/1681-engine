import type { Rect } from './geometry';

export type NavDirection = 'up' | 'down' | 'left' | 'right';

/** How much a step off the line of travel costs against a step along it: favours the item straight ahead. */
const CROSS_WEIGHT = 2;

function cx(r: Rect): number {
  return r.x + r.width / 2;
}

function cy(r: Rect): number {
  return r.y + r.height / 2;
}

/** The item a fresh focus lands on: the top-most, then left-most. */
export function firstFocus(rects: readonly Rect[]): number {
  let best = -1;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    const b = best < 0 ? null : rects[best]!;
    if (!b || r.y < b.y || (r.y === b.y && r.x < b.x)) best = i;
  }
  return best;
}

/**
 * Spatial navigation (a gamepad's d-pad, the arrow keys): from `current`, the nearest item whose centre lies in
 * `dir`, an item straight ahead preferred over a nearer one off to the side. With `wrap`, going past the last item
 * comes back in from the far side on the same line. Returns `current` when nothing lies that way.
 */
export function nextFocus(rects: readonly Rect[], current: number, dir: NavDirection, wrap = false): number {
  if (rects.length === 0) return -1;
  const from = rects[current];
  if (!from) return firstFocus(rects);
  const fx = cx(from);
  const fy = cy(from);
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  let best = -1;
  let bestScore = Infinity;
  // wrapping: the item farthest the other way, closest to the line
  let back = -1;
  let backScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === current) continue;
    const r = rects[i]!;
    const along = ((horizontal ? cx(r) - fx : cy(r) - fy) * sign);
    const across = Math.abs(horizontal ? cy(r) - fy : cx(r) - fx);
    if (along > 0.5) {
      const score = along + CROSS_WEIGHT * across;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    } else if (wrap && along < -0.5) {
      const score = along + CROSS_WEIGHT * across;
      if (score < backScore) {
        backScore = score;
        back = i;
      }
    }
  }
  if (best >= 0) return best;
  return back >= 0 ? back : current;
}

/** Tab order: the next (`step` 1) or previous (−1) of `count` items, wrapping round. */
export function linearFocus(count: number, current: number, step: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0 || current >= count) return step > 0 ? 0 : count - 1;
  return (current + step + count) % count;
}
