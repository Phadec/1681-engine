import type { BoxShape, PolygonShape, Vec2 } from './types';

/** The most corners a polygon shape may have. */
export const MAX_POLYGON_VERTICES = 16;

/** Twice the signed area: positive when the points run clockwise on screen (y down), the order shapes are kept in. */
function doubleArea(points: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

/** The centroid of the convex hull of `points`: where to put the body so a `polygonShape(points)` lands on them. */
export function polygonCentroid(points: readonly Vec2[]): Vec2 {
  const hull = convexHull(points);
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i]!;
    const q = hull[(i + 1) % hull.length]!;
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-9) throw new Error('polygonShape: the points enclose no area');
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/**
 * A convex polygon shape from any points: their convex hull, in the order the solver keeps, moved so its centroid is
 * the body's position. Give points round the origin, or anywhere and place the body at `polygonCentroid(points)`.
 */
export function polygonShape(points: readonly Vec2[]): PolygonShape {
  const hull = convexHull(points);
  if (hull.length < 3) throw new Error('polygonShape: needs at least three points not on one line');
  if (hull.length > MAX_POLYGON_VERTICES) throw new Error(`polygonShape: at most ${MAX_POLYGON_VERTICES} corners, got ${hull.length}`);
  const c = polygonCentroid(hull);
  return { kind: 'polygon', vertices: hull.map((p) => ({ x: p.x - c.x, y: p.y - c.y })) };
}

/** A regular polygon of `sides` corners on a circle of `radius`, its first corner straight up. */
export function regularPolygon(sides: number, radius: number): PolygonShape {
  const n = Math.max(3, Math.min(MAX_POLYGON_VERTICES, Math.round(sides)));
  const points: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    points.push({ x: Math.cos(t) * radius, y: Math.sin(t) * radius });
  }
  return polygonShape(points);
}

/** Andrew's monotone chain, returned clockwise on screen (positive `doubleArea`), collinear points dropped. */
function convexHull(points: readonly Vec2[]): Vec2[] {
  const pts = points.map((p) => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 1e-9) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 1e-9) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  return doubleArea(hull) < 0 ? hull.reverse() : hull;
}

/** Local outward normals and the solver's mass terms of a polygon, worked out once per shape object. */
export interface PolygonData {
  readonly vertices: readonly Vec2[];
  readonly normals: readonly Vec2[];
  /** Second moment of area about the centroid per unit of area-mass: inertia = mass × this. */
  readonly inertiaPerMass: number;
  /** The furthest corner from the centre. */
  readonly radius: number;
  /** The nearest face to the centre: how far the body may move in one sub-step without passing through anything. */
  readonly inradius: number;
}

const cache = new WeakMap<PolygonShape, PolygonData>();

/** The data of a polygon shape, checked (convex, in order) the first time it is asked for. */
export function polygonData(shape: PolygonShape): PolygonData {
  let d = cache.get(shape);
  if (d) return d;
  const v = shape.vertices;
  if (v.length < 3 || v.length > MAX_POLYGON_VERTICES) throw new Error(`Body: a polygon needs 3–${MAX_POLYGON_VERTICES} corners, got ${v.length}`);
  if (doubleArea(v) <= 0) throw new Error('Body: polygon corners must run clockwise on screen (make the shape with polygonShape)');
  const normals: Vec2[] = [];
  let inertia = 0;
  let area = 0;
  let radius = 0;
  let inradius = Infinity;
  for (let i = 0; i < v.length; i++) {
    const p = v[i]!;
    const q = v[(i + 1) % v.length]!;
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) throw new Error('Body: a polygon has two corners in one place');
    const n = { x: ey / len, y: -ex / len };
    normals.push(n);
    const r = v[(i + 2) % v.length]!;
    if ((r.x - p.x) * n.x + (r.y - p.y) * n.y > 1e-6) throw new Error('Body: a polygon must be convex (make the shape with polygonShape)');
    const cross = p.x * q.y - q.x * p.y;
    area += cross / 2;
    inertia += (cross * (p.x * p.x + p.x * q.x + q.x * q.x + p.y * p.y + p.y * q.y + q.y * q.y)) / 12;
    radius = Math.max(radius, Math.hypot(p.x, p.y));
    inradius = Math.min(inradius, p.x * n.x + p.y * n.y);
  }
  d = { vertices: v, normals, inertiaPerMass: inertia / area, radius, inradius };
  cache.set(shape, d);
  return d;
}

/** A box as the four corners the polygon tests use: top-left first, clockwise on screen, so face i is top, right, bottom, left. */
export function boxCorners(s: BoxShape): Vec2[] {
  return [
    { x: -s.halfWidth, y: -s.halfHeight },
    { x: s.halfWidth, y: -s.halfHeight },
    { x: s.halfWidth, y: s.halfHeight },
    { x: -s.halfWidth, y: s.halfHeight },
  ];
}
