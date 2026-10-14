import type { Body } from './Body';
import type { Manifold } from './collide';
import { FACE_BOTTOM, FACE_LEFT, FACE_RIGHT, FACE_TOP } from './types';

/** Face bits of a box's corners order (`Body.updateBounds`): face 0 is the top, then right, bottom, left. */
const BOX_FACE_BITS = [FACE_TOP, FACE_RIGHT, FACE_BOTTOM, FACE_LEFT] as const;

/** A reference face is kept unless the other side's is deeper by more than this (px): no flip-flopping between equals. */
const FLIP_TOLERANCE = 0.05;

/**
 * Whether `body` has an internal face (one lying against more solid ground) whose outward normal is (nx, ny): only
 * a merged tile box at no angle has them.
 */
function internalAlong(body: Body, nx: number, ny: number): boolean {
  if (!body.internalFaces || !body.axisAligned) return false;
  for (let i = 0; i < 4; i++) {
    if (body.internalFaces & BOX_FACE_BITS[i]! && body.wnx[i]! * nx + body.wny[i]! * ny > 0.999) return true;
  }
  return false;
}

/** A contact normal from a to b that pushes neither body out of an internal face. */
function normalAllowed(a: Body, b: Body, nx: number, ny: number): boolean {
  return !internalAlong(a, nx, ny) && !internalAlong(b, -nx, -ny);
}

/** Separation of `other`'s corners from face `i` of `ref`: the most negative is how deep the deepest corner lies. */
function faceSeparation(ref: Body, i: number, other: Body): number {
  const nx = ref.wnx[i]!;
  const ny = ref.wny[i]!;
  const vx = ref.wx[i]!;
  const vy = ref.wy[i]!;
  let min = Infinity;
  for (let j = 0; j < other.corners; j++) {
    const d = (other.wx[j]! - vx) * nx + (other.wy[j]! - vy) * ny;
    if (d < min) min = d;
  }
  return min;
}

interface Best {
  sep: number;
  face: number;
}

/** The face of `ref` the two are furthest apart along, among the faces whose normal may be used; also the plain SAT maximum. */
function bestFace(ref: Body, other: Body, refIsA: boolean, best: Best): number {
  let max = -Infinity;
  best.sep = -Infinity;
  best.face = -1;
  for (let i = 0; i < ref.corners; i++) {
    const s = faceSeparation(ref, i, other);
    if (s > max) max = s;
    const nx = refIsA ? ref.wnx[i]! : -ref.wnx[i]!;
    const ny = refIsA ? ref.wny[i]! : -ref.wny[i]!;
    const ok = refIsA ? normalAllowed(ref, other, nx, ny) : normalAllowed(other, ref, nx, ny);
    if (ok && s > best.sep) {
      best.sep = s;
      best.face = i;
    }
  }
  return max;
}

const bestA: Best = { sep: 0, face: -1 };
const bestB: Best = { sep: 0, face: -1 };
const clipX = [0, 0];
const clipY = [0, 0];
const clipId = [0, 0];

/**
 * Two convex shapes (boxes or polygons, turned or not) by the separating axis test, then the incident edge clipped
 * against the reference face's sides (Box2D's manifold), giving one or two points. A normal out of a merged tile box's
 * internal face is never used, so a turned crate slides over the seams of a tile floor like a square one does.
 */
export function polygonPolygon(a: Body, b: Body, margin: number, out: Manifold): boolean {
  const maxA = bestFace(a, b, true, bestA);
  if (maxA > margin) return false;
  const maxB = bestFace(b, a, false, bestB);
  if (maxB > margin) return false;
  let flip: boolean;
  if (bestA.face < 0 && bestB.face < 0) {
    // every axis is an internal face: fall back to the plain shallowest one, as the axis-aligned test does
    flip = maxB > maxA + FLIP_TOLERANCE;
    if (!flip) bestA.face = faceOfSeparation(a, b, maxA);
    else bestB.face = faceOfSeparation(b, a, maxB);
  } else if (bestA.face < 0) flip = true;
  else if (bestB.face < 0) flip = false;
  else flip = bestB.sep > bestA.sep + FLIP_TOLERANCE;
  const ref = flip ? b : a;
  const inc = flip ? a : b;
  const r = flip ? bestB.face : bestA.face;
  const nrx = ref.wnx[r]!;
  const nry = ref.wny[r]!;
  // the incident face: the one of the other body most against the reference normal
  let k = 0;
  let minDot = Infinity;
  for (let j = 0; j < inc.corners; j++) {
    const d = inc.wnx[j]! * nrx + inc.wny[j]! * nry;
    if (d < minDot) {
      minDot = d;
      k = j;
    }
  }
  const k2 = (k + 1) % inc.corners;
  clipX[0] = inc.wx[k]!;
  clipY[0] = inc.wy[k]!;
  clipId[0] = k;
  clipX[1] = inc.wx[k2]!;
  clipY[1] = inc.wy[k2]!;
  clipId[1] = k2;
  const r2 = (r + 1) % ref.corners;
  const r1x = ref.wx[r]!;
  const r1y = ref.wy[r]!;
  const r2x = ref.wx[r2]!;
  const r2y = ref.wy[r2]!;
  const tl = Math.hypot(r2x - r1x, r2y - r1y);
  const tx = (r2x - r1x) / tl;
  const ty = (r2y - r1y) / tl;
  // keep what lies between the reference face's two side planes
  if (!clip(-tx, -ty, -(tx * r1x + ty * r1y), 16)) return false;
  if (!clip(tx, ty, tx * r2x + ty * r2y, 17)) return false;
  out.nx = flip ? -nrx : nrx;
  out.ny = flip ? -nry : nry;
  out.count = 0;
  out.depth = -Infinity;
  for (let i = 0; i < 2; i++) {
    const sep = (clipX[i]! - r1x) * nrx + (clipY[i]! - r1y) * nry;
    if (sep > margin) continue;
    const n = out.count++;
    // halfway between the incident corner and the reference face
    out.px[n] = clipX[i]! - nrx * sep * 0.5;
    out.py[n] = clipY[i]! - nry * sep * 0.5;
    out.pd[n] = -sep;
    out.id[n] = ((flip ? 1 : 0) << 12) | (r << 6) | clipId[i]!;
    if (-sep > out.depth) out.depth = -sep;
  }
  return out.count > 0;
}

/** The first face of `ref` whose separation is `sep`. */
function faceOfSeparation(ref: Body, other: Body, sep: number): number {
  for (let i = 0; i < ref.corners; i++) if (faceSeparation(ref, i, other) === sep) return i;
  return 0;
}

/** Clips the two points in `clipX/Y` to the half plane n·p ≤ offset; a cut point gets the feature id `cutId`. */
function clip(nx: number, ny: number, offset: number, cutId: number): boolean {
  const d0 = nx * clipX[0]! + ny * clipY[0]! - offset;
  const d1 = nx * clipX[1]! + ny * clipY[1]! - offset;
  if (d0 > 0 && d1 > 0) return false;
  if (d0 <= 0 && d1 <= 0) return true;
  const t = d0 / (d0 - d1);
  const x = clipX[0]! + (clipX[1]! - clipX[0]!) * t;
  const y = clipY[0]! + (clipY[1]! - clipY[0]!) * t;
  if (d0 > 0) {
    clipX[0] = x;
    clipY[0] = y;
    clipId[0] = cutId;
  } else {
    clipX[1] = x;
    clipY[1] = y;
    clipId[1] = cutId;
  }
  return true;
}

/**
 * A circle against a box or polygon that is turned (or turns): the face the centre lies furthest out of, then that
 * face's middle or one of its corners. `circleIsA` says which way round the pair is, so the normal runs from a to b.
 */
export function circlePolygon(circle: Body, radius: number, poly: Body, margin: number, circleIsA: boolean, out: Manifold): boolean {
  const cx = circle.x;
  const cy = circle.y;
  let face = 0;
  let sep = -Infinity;
  for (let i = 0; i < poly.corners; i++) {
    const s = (cx - poly.wx[i]!) * poly.wnx[i]! + (cy - poly.wy[i]!) * poly.wny[i]!;
    if (s > sep) {
      sep = s;
      face = i;
    }
  }
  if (sep > radius + margin) return false;
  // normal from the polygon to the circle, and the distance from the polygon's surface to the circle's centre
  let nx = poly.wnx[face]!;
  let ny = poly.wny[face]!;
  let dist = sep;
  let id = face;
  if (sep > 0) {
    const f2 = (face + 1) % poly.corners;
    const v1x = poly.wx[face]!;
    const v1y = poly.wy[face]!;
    const v2x = poly.wx[f2]!;
    const v2y = poly.wy[f2]!;
    const u1 = (cx - v1x) * (v2x - v1x) + (cy - v1y) * (v2y - v1y);
    const u2 = (cx - v2x) * (v1x - v2x) + (cy - v2y) * (v1y - v2y);
    if (u1 <= 0 || u2 <= 0) {
      const vx = u1 <= 0 ? v1x : v2x;
      const vy = u1 <= 0 ? v1y : v2y;
      const d = Math.hypot(cx - vx, cy - vy);
      if (d > radius + margin) return false;
      if (d > 1e-9) {
        nx = (cx - vx) / d;
        ny = (cy - vy) / d;
      }
      dist = d;
      id = 32 + (u1 <= 0 ? face : f2);
    }
  }
  const depth = radius - dist;
  out.nx = circleIsA ? -nx : nx;
  out.ny = circleIsA ? -ny : ny;
  out.depth = depth;
  out.count = 1;
  out.px[0] = cx - nx * (radius - depth / 2);
  out.py[0] = cy - ny * (radius - depth / 2);
  out.pd[0] = depth;
  out.id[0] = id;
  return true;
}
