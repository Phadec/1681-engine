import type { Body } from './Body';
import type { SpatialHash } from './SpatialHash';
import type { RayHit, RaycastOptions } from './types';

/** Where a ray from (ox, oy) along (dx, dy) — not normalised, t = 1 at its end — first enters a body. */
interface ShapeHit {
  t: number;
  nx: number;
  ny: number;
}

const scratch: ShapeHit = { t: 0, nx: 0, ny: 0 };

/** A ray starting inside the shape misses it, so a body can cast from its own centre without hitting itself. */
export function rayShape(body: Body, ox: number, oy: number, dx: number, dy: number, maxT: number, out: ShapeHit): boolean {
  const s = body.shape;
  if (s.kind === 'circle') {
    const fx = ox - body.x;
    const fy = oy - body.y;
    const a = dx * dx + dy * dy;
    const c = fx * fx + fy * fy - s.radius * s.radius;
    if (c <= 0 || a === 0) return false;
    const b = fx * dx + fy * dy;
    const disc = b * b - a * c;
    if (disc < 0 || b > 0) return false;
    const t = (-b - Math.sqrt(disc)) / a;
    if (t < 0 || t > maxT) return false;
    out.t = t;
    out.nx = (fx + dx * t) / s.radius;
    out.ny = (fy + dy * t) / s.radius;
    return true;
  }
  if (!body.axisAligned) return rayPolygon(body, ox, oy, dx, dy, maxT, out);
  if (ox > body.minX && ox < body.maxX && oy > body.minY && oy < body.maxY) return false;
  let tmin = -Infinity;
  let tmax = Infinity;
  let nx = 0;
  let ny = 0;
  if (dx !== 0) {
    const t1 = (body.minX - ox) / dx;
    const t2 = (body.maxX - ox) / dx;
    const near = Math.min(t1, t2);
    if (near > tmin) {
      tmin = near;
      nx = dx > 0 ? -1 : 1;
      ny = 0;
    }
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (ox < body.minX || ox > body.maxX) return false;
  if (dy !== 0) {
    const t1 = (body.minY - oy) / dy;
    const t2 = (body.maxY - oy) / dy;
    const near = Math.min(t1, t2);
    if (near > tmin) {
      tmin = near;
      nx = 0;
      ny = dy > 0 ? -1 : 1;
    }
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (oy < body.minY || oy > body.maxY) return false;
  if (tmin > tmax || tmin < 0 || tmin > maxT) return false;
  out.t = tmin;
  out.nx = nx;
  out.ny = ny;
  return true;
}

/** Cyrus–Beck: the ray clipped by each face's half plane of a turned box or a polygon (world corners). */
function rayPolygon(body: Body, ox: number, oy: number, dx: number, dy: number, maxT: number, out: ShapeHit): boolean {
  let tmin = 0;
  let tmax = maxT;
  let face = -1;
  let inside = true;
  for (let i = 0; i < body.corners; i++) {
    const nx = body.wnx[i]!;
    const ny = body.wny[i]!;
    // distance of the start outside face i, and how fast the ray closes on it
    const num = (ox - body.wx[i]!) * nx + (oy - body.wy[i]!) * ny;
    const den = dx * nx + dy * ny;
    if (num > 0) inside = false;
    if (den === 0) {
      if (num > 0) return false;
      continue;
    }
    const t = -num / den;
    if (den < 0) {
      if (t > tmin) {
        tmin = t;
        face = i;
      }
    } else if (t < tmax) tmax = t;
    if (tmin > tmax) return false;
  }
  if (inside || face < 0) return false;
  out.t = tmin;
  out.nx = body.wnx[face]!;
  out.ny = body.wny[face]!;
  return true;
}

let rayCounter = 0;

/**
 * The first body a segment from (x0, y0) to (x1, y1) meets, walking the broad phase's cells in the ray's order
 * (Amanatides–Woo) and stopping once the next cell lies beyond the best hit so far; a long ray over a large map
 * looks only at the cells it crosses.
 */
export function castRay(hashes: readonly SpatialHash[], x0: number, y0: number, x1: number, y1: number, options: RaycastOptions = {}): RayHit | null {
  const grid = hashes[0];
  if (!grid) return null;
  const mask = options.mask ?? 0xffffffff;
  const stamp = ++rayCounter;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const size = grid.cellSize;
  let cx = grid.cellOf(x0);
  let cy = grid.cellOf(y0);
  const ex = grid.cellOf(x1);
  const ey = grid.cellOf(y1);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? size / Math.abs(dx) : Infinity;
  const tDeltaY = stepY !== 0 ? size / Math.abs(dy) : Infinity;
  let tMaxX = stepX > 0 ? ((cx + 1) * size - x0) / dx : stepX < 0 ? (cx * size - x0) / dx : Infinity;
  let tMaxY = stepY > 0 ? ((cy + 1) * size - y0) / dy : stepY < 0 ? (cy * size - y0) / dy : Infinity;
  let best: Body | null = null;
  let bestT = 1;
  let bestNx = 0;
  let bestNy = 0;
  // the cell count bounds the walk even if rounding ever kept it from landing on the end cell exactly
  let cellsLeft = Math.abs(ex - cx) + Math.abs(ey - cy) + 1;
  for (;;) {
    for (const hash of hashes) {
      const list = hash.at(cx, cy);
      if (!list) continue;
      for (const body of list) {
        if (body.rayStamp === stamp) continue;
        body.rayStamp = stamp;
        if (!(body.layer & mask)) continue;
        if (body.sensor && !options.includeSensors) continue;
        if (options.filter && !options.filter(body)) continue;
        if (rayShape(body, x0, y0, dx, dy, bestT, scratch) && (!best || scratch.t < bestT)) {
          best = body;
          bestT = scratch.t;
          bestNx = scratch.nx;
          bestNy = scratch.ny;
        }
      }
    }
    if (--cellsLeft <= 0) break;
    const next = Math.min(tMaxX, tMaxY);
    if (next > bestT) break;
    if (tMaxX < tMaxY) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      cy += stepY;
      tMaxY += tDeltaY;
    }
  }
  if (!best) return null;
  return { body: best, x: x0 + dx * bestT, y: y0 + dy * bestT, nx: bestNx, ny: bestNy, fraction: bestT };
}
