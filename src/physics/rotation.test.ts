import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Body } from './Body.ts';
import { PhysicsWorld } from './PhysicsWorld.ts';
import { polygonCentroid, polygonData, polygonShape, regularPolygon } from './polygon.ts';
import { tileBodies } from './tileBodies.ts';
import { FACE_LEFT, FACE_RIGHT } from './types.ts';

const DT = 1 / 60;
const TILE = 16;

function room(world: PhysicsWorld): number {
  world.addAll(tileBodies(60, 20, TILE, (tx, ty) => ty === 19 || tx === 0 || tx === 59));
  return 19 * TILE;
}

/** A ramp falling to the right from (100, 200) to (500, 300), a static polygon placed on its own points. */
function ramp(world: PhysicsWorld): void {
  const pts = [
    { x: 100, y: 200 },
    { x: 500, y: 300 },
    { x: 100, y: 300 },
  ];
  const c = polygonCentroid(pts);
  world.add({ type: 'static', shape: polygonShape(pts), x: c.x, y: c.y });
}

const run = (world: PhysicsWorld, steps: number, each?: (i: number) => void): void => {
  for (let i = 0; i < steps; i++) {
    world.step(DT);
    each?.(i);
  }
};

/** The angle folded onto the nearest quarter turn's offset: 0 when a box lies flat on any face. */
const offFlat = (angle: number): number => {
  const q = Math.PI / 2;
  const r = ((angle % q) + q) % q;
  return Math.min(r, q - r);
};

test('polygonShape orders the hull, drops inner points and centres it', () => {
  const pts = [
    { x: 10, y: 10 },
    { x: 30, y: 10 },
    { x: 20, y: 15 }, // inside
    { x: 30, y: 30 },
    { x: 10, y: 30 },
  ];
  const s = polygonShape(pts);
  assert.equal(s.vertices.length, 4);
  const c = polygonCentroid(pts);
  assert.deepEqual(c, { x: 20, y: 20 });
  for (const v of s.vertices) assert.equal(Math.abs(v.x), 10);
  const d = polygonData(s);
  // a 20×20 square: inertia per mass (w² + h²) / 12
  assert.ok(Math.abs(d.inertiaPerMass - 800 / 12) < 1e-9);
  assert.ok(Math.abs(d.inradius - 10) < 1e-9);
  assert.throws(() => polygonShape([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]));
});

test('a tilted box dropped on the floor comes to rest flat, at its height', () => {
  const world = new PhysicsWorld();
  const floor = room(world);
  const b = world.add({ shape: { kind: 'box', halfWidth: 10, halfHeight: 6 }, x: 200, y: 200, angle: 0.5, rotates: true, friction: 0.6 });
  run(world, 600);
  assert.ok(offFlat(b.angle) < 0.02, `lies flat, angle ${b.angle}`);
  const half = b.maxY - b.y;
  assert.ok(Math.abs(b.maxY - floor) < 1, `rests on the floor, bottom ${b.maxY}`);
  assert.ok(half === 6 || Math.abs(half - 10) < 0.5 || Math.abs(half - 6) < 0.5);
  assert.ok(Math.abs(b.angularVelocity) < 0.05 && Math.abs(b.vy) < 1, 'at rest');
  assert.ok(b.grounded);
});

test('a ball rolls down a ramp without slipping: its spin matches its speed', () => {
  const world = new PhysicsWorld();
  room(world);
  ramp(world);
  const ball = world.add({ shape: { kind: 'circle', radius: 8 }, x: 150, y: 203, rotates: true, friction: 0.9, angularDamping: 0 });
  let rolled = false;
  run(world, 90, (i) => {
    const speed = Math.hypot(ball.vx, ball.vy);
    if (i > 20 && speed > 60) {
      rolled = true;
      // rolling: the contact point stands still, so w × r equals the speed
      assert.ok(Math.abs(ball.angularVelocity * 8 - speed) < speed * 0.1, `w·r ${ball.angularVelocity * 8} vs ${speed}`);
    }
  });
  assert.ok(rolled, 'it got going');
  assert.ok(ball.vx > 0 && ball.angularVelocity > 0, 'rolling right, turning clockwise');
});

test('without rotation the same ball slides and never turns', () => {
  const world = new PhysicsWorld();
  room(world);
  ramp(world);
  const ball = world.add({ shape: { kind: 'circle', radius: 8 }, x: 150, y: 203, friction: 0 });
  run(world, 60);
  assert.equal(ball.angle, 0);
  assert.ok(ball.vx > 0);
});

test('a tall box pushed at its top topples onto its side', () => {
  const world = new PhysicsWorld();
  const floor = room(world);
  const b = world.add({ shape: { kind: 'box', halfWidth: 5, halfHeight: 20 }, x: 300, y: floor - 20, rotates: true, friction: 0.8 });
  run(world, 10);
  b.applyImpulse(60, 0, b.x, b.y - 18);
  run(world, 300);
  assert.ok(Math.abs(Math.abs(b.angle) - Math.PI / 2) < 0.05, `on its side, angle ${b.angle}`);
  assert.ok(Math.abs(b.maxY - floor) < 1, `lying on the floor, bottom ${b.maxY}`);
});

test('a stack of three boxes that may rotate stays standing', () => {
  const world = new PhysicsWorld({ velocityIterations: 10 });
  const floor = room(world);
  const boxes = [0, 1, 2].map((i) => world.add({ shape: { kind: 'box', halfWidth: 8, halfHeight: 8 }, x: 300, y: floor - 8 - i * 16 - i * 0.2, rotates: true, friction: 0.6 }));
  run(world, 600);
  boxes.forEach((b, i) => {
    assert.ok(Math.abs(b.x - 300) < 1, `box ${i} did not slide: x = ${b.x}`);
    assert.ok(Math.abs(b.angle) < 0.02, `box ${i} did not tip: angle ${b.angle}`);
    assert.ok(Math.abs(b.y - (floor - 8 - i * 16)) < 1.5, `box ${i} at its height: y = ${b.y}`);
  });
});

test('a turned crate slides over the seam of two ground boxes without snagging', () => {
  const world = new PhysicsWorld({ gravityY: 980 });
  const left = world.add({ type: 'static', shape: { kind: 'box', halfWidth: 100, halfHeight: 8 }, x: 100, y: 300 });
  const right = world.add({ type: 'static', shape: { kind: 'box', halfWidth: 100, halfHeight: 8 }, x: 300, y: 300 });
  left.internalFaces = FACE_RIGHT;
  right.internalFaces = FACE_LEFT;
  const crate = world.add({ shape: regularPolygon(6, 10), x: 150, y: 283, rotates: true, friction: 0, angle: Math.PI / 6 });
  run(world, 20);
  crate.setVelocity(120, 0);
  let minVx = Infinity;
  run(world, 90, () => (minVx = Math.min(minVx, crate.vx)));
  assert.ok(crate.x > 200, `crossed the seam, x = ${crate.x}`);
  assert.ok(minVx > 110, `never caught, slowest vx ${minVx}`);
});

test('an impulse off the centre spins a body, and a free spin keeps its momentum', () => {
  const world = new PhysicsWorld({ gravityY: 0 });
  const b = world.add({ shape: { kind: 'box', halfWidth: 10, halfHeight: 10 }, rotates: true, angularDamping: 0 });
  b.applyImpulse(0, 10, b.x + 10, b.y);
  const w = b.angularVelocity;
  assert.ok(Math.abs(w - (10 * 10) / b.inertia) < 1e-9);
  run(world, 60);
  assert.ok(Math.abs(b.angularVelocity - w) < 1e-9);
  assert.ok(Math.abs(b.angle - w) < 0.01, 'turned w × 1 s');
});

test('a kinematic spinner bats a ball away', () => {
  const world = new PhysicsWorld({ gravityY: 0 });
  const bar = world.add({ type: 'kinematic', rotates: true, shape: { kind: 'box', halfWidth: 40, halfHeight: 3 }, x: 0, y: 0, angularVelocity: 6 });
  const ball = world.add({ shape: { kind: 'circle', radius: 4 }, x: 30, y: 12 });
  run(world, 30);
  assert.equal(bar.x, 0);
  assert.ok(Math.hypot(ball.vx, ball.vy) > 50, 'the ball was struck');
});

test('raycast meets a turned box on its face, with that face normal', () => {
  const world = new PhysicsWorld({ gravityY: 0 });
  const b = world.add({ type: 'static', shape: { kind: 'box', halfWidth: 10, halfHeight: 10 }, x: 100, y: 0, angle: Math.PI / 4 });
  const hit = world.raycast(0, 0, 200, 0);
  assert.ok(hit && hit.body === b);
  // the corner of a diamond points at the ray: it meets it at x = 100 - 10√2
  assert.ok(Math.abs(hit.x - (100 - 10 * Math.SQRT2)) < 1e-6);
  const miss = world.raycast(0, 20, 200, 20);
  assert.equal(miss, null);
  const slant = world.raycast(0, 5, 200, 5)!;
  assert.ok(slant.nx < 0 && Math.abs(Math.hypot(slant.nx, slant.ny) - 1) < 1e-9);
});

test('contacts carry their points; a box flat on the floor has two', () => {
  const world = new PhysicsWorld();
  const floor = room(world);
  const b = world.add({ shape: { kind: 'box', halfWidth: 10, halfHeight: 6 }, x: 200, y: floor - 6, rotates: true });
  run(world, 30);
  const touching = world.contactsOf(b);
  assert.equal(touching.length, 1);
  assert.equal(touching[0]!.points.length, 2);
  for (const p of touching[0]!.points) assert.ok(Math.abs(p.y - floor) < 1);
});

test('a body made with an angle that does not rotate keeps it', () => {
  const world = new PhysicsWorld();
  const floor = room(world);
  const b = world.add(new Body({ shape: { kind: 'box', halfWidth: 10, halfHeight: 4 }, x: 200, y: floor - 40, angle: 0.3 }));
  run(world, 240);
  assert.equal(b.angle, 0.3);
  assert.ok(b.grounded, 'lands on a corner and stays there');
});
