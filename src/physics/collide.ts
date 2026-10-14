import type { Body } from './Body';
import { FACE_BOTTOM, FACE_LEFT, FACE_RIGHT, FACE_TOP, type BoxShape, type CircleShape } from './types';

/** The result of a narrow-phase test: the normal points from `a` to `b`, `depth` > 0 is overlap, < 0 a gap. */
export interface Manifold {
  nx: number;
  ny: number;
  depth: number;
}

/**
 * Narrow phase. Fills `out` and returns true when the two shapes overlap or lie closer than `margin`. The margin
 * keeps a resting contact alive while the solver holds the bodies a hair apart, so a body standing on the ground is
 * grounded on every step instead of flickering between touching and not.
 */
export function collide(a: Body, b: Body, margin: number, out: Manifold): boolean {
  const sa = a.shape;
  const sb = b.shape;
  if (sa.kind === 'box') {
    if (sb.kind === 'box') return boxBox(a, sa, b, sb, margin, out);
    if (!circleBox(b, sb, a, sa, margin, out)) return false;
    // circleBox gives the normal from the box (a) to the circle (b): already a → b
    return true;
  }
  if (sb.kind === 'circle') return circleCircle(a, sa, b, sb, margin, out);
  if (!circleBox(a, sa, b, sb, margin, out)) return false;
  out.nx = -out.nx;
  out.ny = -out.ny;
  return true;
}

/** Whether a normal along x (sign sx, from a to b) may be used: not out of a face either box marks as internal. */
function xAllowed(a: Body, b: Body, sx: number): boolean {
  return sx > 0 ? !(a.internalFaces & FACE_RIGHT) && !(b.internalFaces & FACE_LEFT) : !(a.internalFaces & FACE_LEFT) && !(b.internalFaces & FACE_RIGHT);
}

function yAllowed(a: Body, b: Body, sy: number): boolean {
  return sy > 0 ? !(a.internalFaces & FACE_BOTTOM) && !(b.internalFaces & FACE_TOP) : !(a.internalFaces & FACE_TOP) && !(b.internalFaces & FACE_BOTTOM);
}

function boxBox(a: Body, sa: BoxShape, b: Body, sb: BoxShape, margin: number, out: Manifold): boolean {
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

function circleCircle(a: Body, sa: CircleShape, b: Body, sb: CircleShape, margin: number, out: Manifold): boolean {
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
function circleBox(c: Body, sc: CircleShape, b: Body, sb: BoxShape, margin: number, out: Manifold): boolean {
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
