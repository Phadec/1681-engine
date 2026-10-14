import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Body } from './Body.ts';
import { BroadPhase } from './BroadPhase.ts';
import { collide, emptyManifold } from './collide.ts';
import { polygonShape, regularPolygon } from './polygon.ts';
import { rayShape } from './raycast.ts';
import { syncToBody } from './syncToBody.ts';
import type { Shape } from './types.ts';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const box = (hw: number, hh: number): Shape => ({ kind: 'box', halfWidth: hw, halfHeight: hh });
const circle = (radius: number): Shape => ({ kind: 'circle', radius });

/** The same shape twice: as a body that takes the axis-aligned tests, and as one that takes the polygon tests. */
function pair(shape: Shape, x: number, y: number) {
  return {
    square: new Body({ shape, x, y }),
    // turning makes a box take the polygon path, though it stands square
    turning: new Body({ shape, x, y, rotates: true }),
  };
}

/** Whether a point lies inside a body's shape, by its own geometry (not by the code under test). */
function inside(b: Body, px: number, py: number): boolean {
  const s = b.shape;
  const dx = px - b.x;
  const dy = py - b.y;
  if (s.kind === 'circle') return dx * dx + dy * dy <= s.radius * s.radius;
  const c = Math.cos(-b.angle);
  const n = Math.sin(-b.angle);
  const lx = c * dx - n * dy;
  const ly = n * dx + c * dy;
  if (s.kind === 'box') return Math.abs(lx) <= s.halfWidth && Math.abs(ly) <= s.halfHeight;
  const v = s.vertices;
  let sign = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i]!;
    const b2 = v[(i + 1) % v.length]!;
    const cross = (b2.x - a.x) * (ly - a.y) - (b2.y - a.y) * (lx - a.x);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

test('two square boxes: the axis-aligned test and the polygon test agree on overlap, normal and depth', () => {
  const r = rng(11);
  let overlapping = 0;
  for (let i = 0; i < 400; i++) {
    const a = pair(box(2 + r() * 20, 2 + r() * 20), 0, 0);
    const b = pair(box(2 + r() * 20, 2 + r() * 20), (r() - 0.5) * 60, (r() - 0.5) * 60);
    const m1 = emptyManifold();
    const m2 = emptyManifold();
    const hit1 = collide(a.square, b.square, 0, m1);
    const hit2 = collide(a.turning, b.turning, 0, m2);
    // right at touching, either answer is fair
    if (Math.abs(m1.depth) < 1e-6 || Math.abs(m2.depth) < 1e-6) continue;
    assert.equal(hit1, hit2, `case ${i}`);
    if (!hit1) continue;
    overlapping++;
    assert.ok(Math.abs(m1.depth - m2.depth) < 1e-6, `case ${i}: depth ${m1.depth} vs ${m2.depth}`);
    // ties between equally shallow axes may pick either; otherwise the same axis
    const tie = Math.abs(Math.min(a.square.maxX, b.square.maxX) - Math.max(a.square.minX, b.square.minX) - (Math.min(a.square.maxY, b.square.maxY) - Math.max(a.square.minY, b.square.minY))) < 1e-6;
    if (!tie) assert.ok(Math.abs(m1.nx * m2.nx + m1.ny * m2.ny - 1) < 1e-9, `case ${i}: normals differ`);
  }
  assert.ok(overlapping > 50, `only ${overlapping} overlapping cases`);
});

test('a circle and a box: the axis-aligned test and the polygon test agree', () => {
  const r = rng(12);
  let overlapping = 0;
  for (let i = 0; i < 400; i++) {
    const shape = box(4 + r() * 16, 4 + r() * 16);
    const square = new Body({ shape, x: 0, y: 0 });
    // turned by nothing at all, but not 0: the polygon path
    const polygon = new Body({ shape, x: 0, y: 0, angle: 1e-12 });
    const c = new Body({ shape: circle(2 + r() * 10), x: (r() - 0.5) * 50, y: (r() - 0.5) * 50 });
    const m1 = emptyManifold();
    const m2 = emptyManifold();
    const hit1 = collide(c, square, 0, m1);
    const hit2 = collide(c, polygon, 0, m2);
    if (Math.abs(m1.depth) < 1e-4) continue;
    assert.equal(hit1, hit2, `case ${i}`);
    if (!hit1) continue;
    overlapping++;
    assert.ok(Math.abs(m1.depth - m2.depth) < 1e-4, `case ${i}: depth ${m1.depth} vs ${m2.depth}`);
    assert.ok(m1.nx * m2.nx + m1.ny * m2.ny > 0.999, `case ${i}: normals differ`);
  }
  assert.ok(overlapping > 50);
});

test('swapping the two bodies turns the normal round and keeps the depth, within the face hysteresis', () => {
  const r = rng(13);
  const shapes = () => [box(3 + r() * 10, 3 + r() * 10), circle(3 + r() * 10), regularPolygon(3 + Math.floor(r() * 5), 4 + r() * 8)];
  for (let i = 0; i < 300; i++) {
    const [s1, s2] = [shapes()[Math.floor(r() * 3)]!, shapes()[Math.floor(r() * 3)]!];
    const a = new Body({ shape: s1, x: 0, y: 0, angle: r() < 0.5 ? 0 : r() * 6, rotates: r() < 0.5 });
    const b = new Body({ shape: s2, x: (r() - 0.5) * 30, y: (r() - 0.5) * 30, angle: r() < 0.5 ? 0 : r() * 6 });
    const ab = emptyManifold();
    const ba = emptyManifold();
    const h1 = collide(a, b, 0, ab);
    const h2 = collide(b, a, 0, ba);
    if (Math.abs(ab.depth) < 1e-4) continue;
    assert.equal(h1, h2, `case ${i}`);
    if (!h1) continue;
    // the polygon test keeps the first body's face unless the other's is deeper by FLIP_TOLERANCE (0.05 px), so a
    // swap may pick the other face of two nearly as good: then the depths differ by less than that
    const diff = Math.abs(ab.depth - ba.depth);
    assert.ok(diff <= 0.05 + 1e-9, `case ${i}: depth ${ab.depth} vs ${ba.depth}`);
    if (diff < 1e-6) assert.ok(ab.nx * ba.nx + ab.ny * ba.ny < -0.999, `case ${i}: the normal did not turn round`);
  }
});

test('the normal points from a to b, has unit length, and contact points lie in the overlap', () => {
  const r = rng(14);
  let checked = 0;
  for (let i = 0; i < 300; i++) {
    const a = new Body({ shape: r() < 0.5 ? box(5 + r() * 10, 5 + r() * 10) : regularPolygon(5, 8), x: 0, y: 0, angle: r() * 6 });
    const b = new Body({ shape: r() < 0.5 ? circle(4 + r() * 8) : box(4 + r() * 8, 4 + r() * 8), x: (r() - 0.5) * 24, y: (r() - 0.5) * 24, angle: r() * 6 });
    const m = emptyManifold();
    if (!collide(a, b, 0, m) || m.depth < 0.5) continue;
    checked++;
    assert.ok(Math.abs(Math.hypot(m.nx, m.ny) - 1) < 1e-9);
    // pushing b along the normal by the depth (and a bit) separates them
    const moved = new Body({ shape: b.shape, x: b.x + m.nx * (m.depth + 0.01), y: b.y + m.ny * (m.depth + 0.01), angle: b.angle });
    const after = emptyManifold();
    assert.ok(!collide(a, moved, 0, after) || after.depth < 0.02, `case ${i}: still ${after.depth} deep after the push`);
    for (let k = 0; k < m.count; k++) {
      const px = m.px[k]!;
      const py = m.py[k]!;
      // a contact point sits on the surface of one and within the depth of the other: inside both, grown by the depth
      const grownA = new Body({ shape: grow(a.shape, m.depth + 0.05), x: a.x, y: a.y, angle: a.angle });
      const grownB = new Body({ shape: grow(b.shape, m.depth + 0.05), x: b.x, y: b.y, angle: b.angle });
      assert.ok(inside(grownA, px, py) && inside(grownB, px, py), `case ${i}: point ${px},${py} outside the overlap`);
    }
  }
  assert.ok(checked > 50, `only ${checked} cases`);
});

function grow(s: Shape, by: number): Shape {
  if (s.kind === 'circle') return circle(s.radius + by);
  if (s.kind === 'box') return box(s.halfWidth + by, s.halfHeight + by);
  // a polygon grown by scaling out from its centre, enough for a containment check
  const k = 1 + by / Math.min(...s.vertices.map((v) => Math.hypot(v.x, v.y)));
  return polygonShape(s.vertices.map((v) => ({ x: v.x * k, y: v.y * k })));
}

test('a margin keeps a near miss as a contact with a negative depth', () => {
  const a = new Body({ shape: box(5, 5), x: 0, y: 0 });
  const b = new Body({ shape: box(5, 5), x: 10.5, y: 0 });
  const m = emptyManifold();
  assert.equal(collide(a, b, 0, m), false);
  assert.equal(collide(a, b, 1, m), true);
  assert.ok(Math.abs(m.depth + 0.5) < 1e-9);
  assert.deepEqual([m.nx, m.ny], [1, 0]);
});

test('a ray first meets a shape where walking along it first steps inside, with a normal facing back', () => {
  const r = rng(15);
  const out = { t: 0, nx: 0, ny: 0 };
  let hits = 0;
  for (let i = 0; i < 300; i++) {
    const kind = i % 3;
    const shape = kind === 0 ? circle(3 + r() * 10) : kind === 1 ? box(3 + r() * 10, 3 + r() * 10) : regularPolygon(3 + Math.floor(r() * 6), 4 + r() * 8);
    const body = new Body({ shape, x: 0, y: 0, angle: kind === 0 ? 0 : r() * 6 });
    const ox = (r() - 0.5) * 80;
    const oy = (r() - 0.5) * 80;
    if (inside(body, ox, oy)) continue;
    const tx = (r() - 0.5) * 20;
    const ty = (r() - 0.5) * 20;
    const dx = (tx - ox) * 1.5;
    const dy = (ty - oy) * 1.5;
    // the ground truth: the first of 20 000 steps along the ray that lands inside
    let truth = -1;
    for (let k = 0; k <= 20000; k++) {
      const t = k / 20000;
      if (inside(body, ox + dx * t, oy + dy * t)) {
        truth = t;
        break;
      }
    }
    const hit = rayShape(body, ox, oy, dx, dy, 1, out);
    if (truth < 0) {
      // a ray that only grazes the shape may fall between the samples
      if (hit) assert.ok(out.t >= 0 && out.t <= 1);
      continue;
    }
    assert.ok(hit, `case ${i}: missed what the walk stepped into at ${truth}`);
    hits++;
    assert.ok(Math.abs(out.t - truth) < 1 / 20000 + 1e-6, `case ${i}: t ${out.t} vs ${truth}`);
    assert.ok(Math.abs(Math.hypot(out.nx, out.ny) - 1) < 1e-9);
    assert.ok(out.nx * dx + out.ny * dy <= 1e-9, `case ${i}: the normal faces along the ray`);
  }
  assert.ok(hits > 100, `only ${hits} hits`);
});

test('a ray starting inside a shape misses it, and one stopped short misses it too', () => {
  const out = { t: 0, nx: 0, ny: 0 };
  for (const shape of [circle(5), box(5, 5), regularPolygon(6, 5)]) {
    const b = new Body({ shape, x: 0, y: 0 });
    assert.equal(rayShape(b, 0, 0, 20, 0, 1, out), false, shape.kind);
    assert.equal(rayShape(b, -20, 0, 20, 0, 0.5, out), false, `${shape.kind} short`);
    assert.equal(rayShape(b, -20, 0, 20, 0, 1, out), true, `${shape.kind} long enough`);
  }
});

test('the broad phase finds every pair whose bounds overlap and one of which moves, each once', () => {
  const r = rng(16);
  const bodies: Body[] = [];
  for (let i = 0; i < 80; i++) {
    bodies.push(new Body({ type: r() < 0.3 ? 'static' : 'dynamic', shape: r() < 0.5 ? box(2 + r() * 12, 2 + r() * 12) : circle(2 + r() * 10), x: r() * 300, y: r() * 300 }));
  }
  // what a world sets on the bodies it holds
  for (const b of bodies) b.inWorld = true;
  const margin = 0.5;
  const bp = new BroadPhase(32, margin);
  bp.rebuild(bodies);
  const found = new Set<string>();
  bp.pairs(bodies, (a, b) => {
    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    assert.ok(!found.has(key), `pair ${key} twice`);
    found.add(key);
  });
  const want = new Set<string>();
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      if (a.isStatic && b.isStatic) continue;
      const overlap = a.minX - margin <= b.maxX + margin && b.minX - margin <= a.maxX + margin && a.minY - margin <= b.maxY + margin && b.minY - margin <= a.maxY + margin;
      if (overlap) want.add(a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`);
    }
  for (const k of want) assert.ok(found.has(k), `missed pair ${k}`);
  assert.ok(want.size > 10);
});

test('a view is placed between the last two steps, offset turned with the body, the short way round', () => {
  const b = new Body({ shape: box(4, 4), x: 10, y: 0, rotates: true });
  b.prevX = 0;
  b.prevY = 0;
  b.x = 10;
  b.y = 20;
  const view: { x: number; y: number; rotation?: number } = { x: 0, y: 0 };
  syncToBody(view, b, 0.5);
  assert.deepEqual([view.x, view.y, view.rotation], [5, 10, 0]);
  // from just under +π to just over −π is a small step, not almost a whole turn
  b.prevAngle = Math.PI - 0.1;
  b.angle = -Math.PI + 0.1;
  syncToBody(view, b, 0.5, 2, 0);
  assert.ok(Math.abs(Math.abs(view.rotation!) - Math.PI) < 1e-9);
  assert.ok(Math.abs(view.x - (5 - 2)) < 1e-9, 'the offset turned half a turn with it');
  const still = new Body({ shape: box(4, 4), x: 3.4, y: 7.6 });
  const v2: { x: number; y: number; rotation?: number } = { x: 0, y: 0 };
  syncToBody(v2, still, 1, 1, 1, true);
  assert.deepEqual([v2.x, v2.y, v2.rotation], [4, 9, undefined], 'rounded, and not turned');
});
