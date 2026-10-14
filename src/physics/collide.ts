import type { Body } from './Body';
import { circlePolygon, polygonPolygon } from './collidePolygon';
import { FACE_BOTTOM, FACE_LEFT, FACE_RIGHT, FACE_TOP, type BoxShape, type CircleShape } from './types';

/**
 * The result of a narrow-phase test: the normal points from `a` to `b`, `depth` > 0 is overlap, < 0 a gap (the
 * deepest of the points). Up to two contact points, each with its own depth and a feature id that stays the same
 * while the same corners touch, so the solver can carry each point's impulse over from step to step.
 */
export interface Manifold {
  nx: number;
  ny: number;
  depth: number;
  count: number;
  readonly px: [number, number];
  readonly py: [number, number];
  readonly pd: [number, number];
  readonly id: [number, number];
}

export function emptyManifold(): Manifold {
  return { nx: 0, ny: 0, depth: 0, count: 0, px: [0, 0], py: [0, 0], pd: [0, 0], id: [0, 0] };
}

/**
 * Narrow phase. Fills `out` and returns true when the two shapes overlap or lie closer than `margin`. The margin
 * keeps a resting contact alive while the solver holds the bodies a hair apart, so a body standing on the ground is
 * grounded on every step instead of flickering between touching and not.
 *
 * Two bodies that never turn and sit square (boxes at no angle, circles) take the axis-aligned tests, which know the
 * internal faces of merged tile boxes; anything turned or turning takes the polygon tests (`collidePolygon.ts`).
 */
export function collide(a: Body, b: Body, margin: number, out: Manifold): boolean {
  const sa = a.shape;
  const sb = b.shape;
  if (sa.kind === 'circle' && sb.kind === 'circle') {
    if (!circleCircle(a, sa, b, sb, margin, out)) return false;
    onePoint(out, a.x + out.nx * (sa.radius - out.depth / 2), a.y + out.ny * (sa.radius - out.depth / 2));
    return true;
  }
  if (sa.kind === 'circle') {
    if (!b.axisAligned) return circlePolygon(a, sa.radius, b, margin, true, out);
    if (!circleBox(a, sa, b, sb as BoxShape, margin, out)) return false;
    out.nx = -out.nx;
    out.ny = -out.ny;
    // the normal now runs from the circle (a) to the box: the circle's surface point is ahead of its centre
    onePoint(out, a.x + out.nx * (sa.radius - out.depth / 2), a.y + out.ny * (sa.radius - out.depth / 2));
    return true;
  }
  if (sb.kind === 'circle') {
    if (!a.axisAligned) return circlePolygon(b, sb.radius, a, margin, false, out);
    if (!circleBox(b, sb, a, sa as BoxShape, margin, out)) return false;
    // circleBox gives the normal from the box (a) to the circle (b): already a → b
    onePoint(out, b.x - out.nx * (sb.radius - out.depth / 2), b.y - out.ny * (sb.radius - out.depth / 2));
    return true;
  }
  if (a.axisAligned && b.axisAligned && a.invInertia === 0 && b.invInertia === 0) {
    if (!boxBox(a, sa as BoxShape, b, sb as BoxShape, margin, out)) return false;
    // neither turns, so where the point lies changes nothing: the middle of the overlap
    onePoint(out, (Math.max(a.minX, b.minX) + Math.min(a.maxX, b.maxX)) / 2, (Math.max(a.minY, b.minY) + Math.min(a.maxY, b.maxY)) / 2);
    return true;
  }
  return polygonPolygon(a, b, margin, out);
}

function onePoint(out: Manifold, x: number, y: number): void {
  out.count = 1;
  out.px[0] = x;
  out.py[0] = y;
  out.pd[0] = out.depth;
  out.id[0] = 0;
}

/** The narrow phase's three numbers, for the axis-aligned tests below. */
interface Normal {
  nx: number;
  ny: number;
  depth: number;
}

/** Whether a normal along x (sign sx, from a to b) may be used: not out of a face either box marks as internal. */
function xAllowed(a: Body, b: Body, sx: number): boolean {
  return sx > 0 ? !(a.internalFaces & FACE_RIGHT) && !(b.internalFaces & FACE_LEFT) : !(a.internalFaces & FACE_LEFT) && !(b.internalFaces & FACE_RIGHT);
}

function yAllowed(a: Body, b: Body, sy: number): boolean {
  return sy > 0 ? !(a.internalFaces & FACE_BOTTOM) && !(b.internalFaces & FACE_TOP) : !(a.internalFaces & FACE_TOP) && !(b.internalFaces & FACE_BOTTOM);
}

function boxBox(a: Body, sa: BoxShape, b: Body, sb: BoxShape, margin: number, out: Normal): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const px = sa.halfWidth + sb.halfWidth - Math.abs(dx);
  const py = sa.halfHeight + sb.halfHeight - Math.abs(dy);
  if (px <= -margin || py <= -margin) return false;
  // corner to corner across a gap: no face faces the other, and a contact here only snags bodies sliding past
  if (px < 0 && py < 0) return false;
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  let useX: boolean;
  if (px < 0) useX = true;
  else if (py < 0) useX = false;
  else {
    const okX = xAllowed(a, b, sx);
    const okY = yAllowed(a, b, sy);
    useX = okX && okY ? px < py : okX ? true : okY ? false : px < py;
  }
  if (useX) {
    if (px < 0 && !xAllowed(a, b, sx)) return false;
    out.nx = sx;
    out.ny = 0;
    out.depth = px;
  } else {
    if (py < 0 && !yAllowed(a, b, sy)) return false;
    out.nx = 0;
    out.ny = sy;
    out.depth = py;
  }
  return true;
}

function circleCircle(a: Body, sa: CircleShape, b: Body, sb: CircleShape, margin: number, out: Normal): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const r = sa.radius + sb.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= (r + margin) * (r + margin)) return false;
  const d = Math.sqrt(d2);
  if (d > 1e-9) {
    out.nx = dx / d;
    out.ny = dy / d;
  } else {
    out.nx = 0;
    out.ny = 1;
  }
  out.depth = r - d;
  return true;
}

/**
 * Circle `c` against box `b`; the normal is written from the box to the circle. A face the box marks as internal
 * is never pushed out of, and at a corner beside an internal face the other face's axis is used instead, so a ball
 * rolls over the seam between two ground boxes without a bump.
 */
function circleBox(c: Body, sc: CircleShape, b: Body, sb: BoxShape, margin: number, out: Normal): boolean {
  const hw = sb.halfWidth;
  const hh = sb.halfHeight;
  const r = sc.radius;
  const dx = c.x - b.x;
  const dy = c.y - b.y;
  const faces = b.internalFaces;
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  const xFaceOpen = !(faces & (sx > 0 ? FACE_RIGHT : FACE_LEFT));
  const yFaceOpen = !(faces & (sy > 0 ? FACE_BOTTOM : FACE_TOP));
  const insideX = Math.abs(dx) <= hw;
  const insideY = Math.abs(dy) <= hh;
  if (insideX && insideY) {
    const penX = hw - Math.abs(dx) + r;
    const penY = hh - Math.abs(dy) + r;
    const useX = xFaceOpen && yFaceOpen ? penX < penY : xFaceOpen ? true : yFaceOpen ? false : penX < penY;
    out.nx = useX ? sx : 0;
    out.ny = useX ? 0 : sy;
    out.depth = useX ? penX : penY;
    return true;
  }
  if (insideY) {
    // beside a vertical face
    if (!xFaceOpen) return false;
    const gap = Math.abs(dx) - hw;
    if (gap >= r + margin) return false;
    out.nx = sx;
    out.ny = 0;
    out.depth = r - gap;
    return true;
  }
  if (insideX) {
    if (!yFaceOpen) return false;
    const gap = Math.abs(dy) - hh;
    if (gap >= r + margin) return false;
    out.nx = 0;
    out.ny = sy;
    out.depth = r - gap;
    return true;
  }
  // a corner region
  const ex = dx - sx * hw;
  const ey = dy - sy * hh;
  if (!xFaceOpen && !yFaceOpen) return false;
  if (!xFaceOpen || !yFaceOpen) {
    // the corner belongs to a longer surface: collide with that surface's line, not the corner's point
    const gap = !xFaceOpen ? Math.abs(ey) : Math.abs(ex);
    if (gap >= r + margin) return false;
    out.nx = !xFaceOpen ? 0 : sx;
    out.ny = !xFaceOpen ? sy : 0;
    out.depth = r - gap;
    return true;
  }
  const d2 = ex * ex + ey * ey;
  if (d2 >= (r + margin) * (r + margin)) return false;
  const d = Math.sqrt(d2);
  out.nx = d > 1e-9 ? ex / d : sx;
  out.ny = d > 1e-9 ? ey / d : 0;
  out.depth = r - d;
  return true;
}
