import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Body } from './Body.ts';
import { PhysicsWorld } from './PhysicsWorld.ts';
import { tileBodies } from './tileBodies.ts';
import type { ContactInfo } from './types.ts';

const DT = 1 / 60;
const TILE = 16;

/** A 40×20-tile room: a floor on the last row, walls on both sides. The floor's top is at y = 19 × 16 = 304. */
function room(world: PhysicsWorld): number {
  world.addAll(tileBodies(40, 20, TILE, (tx, ty) => ty === 19 || tx === 0 || tx === 39));
  return 19 * TILE;
}

const box = (x: number, y: number, half = 8, extra: Partial<ConstructorParameters<typeof Body>[0]> = {}): Body =>
  new Body({ shape: { kind: 'box', halfWidth: half, halfHeight: half }, x, y, ...extra });

const run = (world: PhysicsWorld, steps: number, each?: (i: number) => void): void => {
  for (let i = 0; i < steps; i++) {
    world.step(DT);
    each?.(i);
  }
};

test('a ball bounces with restitution, each bounce lower, then comes to rest', () => {
  const world = new PhysicsWorld();
  const floor = room(world);
  const ball = world.add({ shape: { kind: 'circle', radius: 6 }, x: 100, y: 100, restitution: 0.6 });
  const peaks: number[] = [];
  let rising = false;
  let top = ball.y;
  run(world, 600, () => {
    if (ball.vy < 0) {
      rising = true;
      top = Math.min(top, ball.y);
    } else if (rising) {
      peaks.push(top);
      rising = false;
      top = ball.y;
    }
  });
  assert.ok(peaks.length >= 2, `bounced ${peaks.length} times`);
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i]! > peaks[i - 1]!, 'each bounce is lower than the last');
  assert.ok(Math.abs(ball.y - (floor - 6)) < 1, `rests on the floor, y = ${ball.y}`);
  assert.ok(Math.abs(ball.vy) < 1, `at rest, vy = ${ball.vy}`);
});

test('a box rests on a tile floor for 600 steps without sinking or jittering', () => {
  const world = new PhysicsWorld();
  const floor = room(world);
  const b = world.add(box(200, 250));
  run(world, 120);
  const ys: number[] = [];
  run(world, 600, () => ys.push(b.y));
  const rest = floor - 8;
  for (const y of ys) assert.ok(Math.abs(y - rest) < 0.6, `y ${y} stays at ${rest}`);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 0.05, 'no jitter');
  assert.ok(b.grounded);
});

test('a stack of three boxes stays standing', () => {
  const world = new PhysicsWorld();
  const floor = room(world);
  const boxes = [0, 1, 2].map((i) => world.add(box(300, floor - 8 - i * 16 - i * 0.5)));
  run(world, 600);
  boxes.forEach((b, i) => {
    assert.ok(Math.abs(b.x - 300) < 0.5, `box ${i} did not slide: x = ${b.x}`);
    assert.ok(Math.abs(b.y - (floor - 8 - i * 16)) < 1.5, `box ${i} at its height: y = ${b.y}`);
  });
  assert.equal(boxes[1]!.ground, boxes[0]);
  assert.equal(boxes[2]!.ground, boxes[1]);
});

test('friction stops a sliding box; without friction it keeps sliding', () => {
  const world = new PhysicsWorld();
  const floor = room(world);
  const rough = world.add(box(100, floor - 8, 8, { vx: 200, friction: 0.5, mask: 1 }));
  const ice = world.add(box(100, floor - 40, 8, { vx: 200, friction: 0, mask: 1, layer: 2 }));
  run(world, 120);
  assert.ok(Math.abs(rough.vx) < 0.01, `stopped, vx = ${rough.vx}`);
  // 200 px/s against 0.5 × 980 px/s² stops in ~0.41 s, ~41 px
  assert.ok(rough.x > 130 && rough.x < 150, `slid a fitting distance: ${rough.x}`);
  assert.ok(ice.vx > 190, `ice keeps its speed: ${ice.vx}`);
});

test('grounded only while standing on something, with the ground and its normal', () => {
  const world = new PhysicsWorld();
  const floor = room(world);
  const b = world.add(box(200, floor - 60));
  world.step(DT);
  assert.equal(b.grounded, false);
  run(world, 60);
  assert.equal(b.grounded, true);
  assert.equal(b.groundNy, -1);
  assert.ok(b.ground?.isStatic);
  b.applyImpulse(0, -400);
  run(world, 3);
  assert.equal(b.grounded, false, 'airborne after a jump');
  // pressed against a wall in mid-air is not grounded
  const w = world.add(box(TILE + 8.2, 100, 8, { gravityScale: 0, vx: -50 }));
  run(world, 10);
  assert.equal(w.grounded, false);
  assert.ok(world.contactsOf(w).length === 1, 'but it touches the wall');
});

test('sensors report begin and end, and push nothing', () => {
  const world = new PhysicsWorld();
  const floor = room(world);
  const zone = world.add({ type: 'static', sensor: true, shape: { kind: 'box', halfWidth: 20, halfHeight: 20 }, x: 200, y: floor - 20 });
  const b = world.add(box(120, floor - 8, 8, { vx: 150, friction: 0 }));
  const log: string[] = [];
  world.events.on('begin', (c: ContactInfo) => c.sensor && log.push(`begin ${c.a === zone || c.b === zone}`));
  world.events.on('end', (c: ContactInfo) => c.sensor && log.push(`end ${c.a === zone || c.b === zone}`));
  run(world, 120);
  assert.deepEqual(log, ['begin true', 'end true']);
  assert.ok(b.vx > 149, 'passed through at full speed');
});

test('begin and end for solid pairs, once each', () => {
  const world = new PhysicsWorld();
  room(world);
  const b = world.add(box(200, 200));
  let begins = 0;
  let ends = 0;
  world.events.on('begin', (c) => (c.a === b || c.b === b) && begins++);
  world.events.on('end', (c) => (c.a === b || c.b === b) && ends++);
  run(world, 200);
  assert.equal(begins, 1);
  assert.equal(ends, 0);
  world.remove(b);
  assert.equal(ends, 1);
});

test('raycast hits the nearest body with the right point and normal', () => {
  const world = new PhysicsWorld();
  const floor = room(world);
  const ball = world.add({ type: 'static', shape: { kind: 'circle', radius: 10 }, x: 300, y: 100 });
  const down = world.raycast(100, 50, 100, 1000);
  assert.ok(down);
  assert.ok(down.body.isStatic);
  assert.equal(down.y, floor);
  assert.deepEqual([down.nx, down.ny], [0, -1]);
  const right = world.raycast(100, 100, 600, 100);
  assert.equal(right?.body, ball);
  assert.ok(Math.abs(right.x - 290) < 1e-9);
  assert.ok(Math.abs(right.nx + 1) < 1e-9);
  assert.equal(world.raycast(100, 100, 200, 100), null, 'too short');
  assert.equal(world.raycast(100, 100, 700, 100, { filter: (b) => b !== ball })?.body.isStatic, true, 'filtered: hits the far wall');
  assert.equal(world.raycast(300, 100, 300, 0), null, 'starting inside a body skips it');
});

test('layers and masks decide who collides', () => {
  const world = new PhysicsWorld();
  const floor = room(world);
  const ghost = world.add(box(100, floor - 8, 8, { layer: 4, mask: 0 }));
  const groundOnly = world.add(box(200, floor - 8, 8, { layer: 2, mask: 1 }));
  const other = world.add(box(200, floor - 40, 8, { layer: 2, mask: 1 }));
  run(world, 60);
  assert.ok(ghost.y > floor + 50, 'falls through everything');
  assert.ok(Math.abs(groundOnly.y - (floor - 8)) < 1);
  assert.ok(Math.abs(other.y - (floor - 8)) < 1, 'passes through the box of its own layer to the ground');
  assert.equal(world.raycast(100, 0, 100, 1000, { mask: 2 })?.body, undefined);
});

test('nothing tunnels at high speed', () => {
  const world = new PhysicsWorld({ gravityY: 0 });
  // a one-tile floor and a one-tile wall
  world.addAll(tileBodies(40, 40, TILE, (tx, ty) => ty === 30 || tx === 35));
  const ball = world.add({ shape: { kind: 'circle', radius: 4 }, x: 100, y: 50, vy: 3500 });
  const fast = world.add(box(100, 300, 4, { vx: 3900 }));
  run(world, 60);
  assert.ok(ball.y < 30 * TILE, `ball stopped above the floor: ${ball.y}`);
  assert.ok(fast.x < 35 * TILE, `box stopped before the wall: ${fast.x}`);
});

test('a kinematic platform carries a box and is not pushed', () => {
  const world = new PhysicsWorld();
  const floor = room(world);
  const lift = world.add({ type: 'kinematic', shape: { kind: 'box', halfWidth: 32, halfHeight: 4 }, x: 200, y: floor - 100, vx: 60 });
  const b = world.add(box(200, floor - 112));
  run(world, 60);
  assert.ok(Math.abs(lift.x - 260) < 1e-6 && Math.abs(lift.y - (floor - 100)) < 1e-9);
  assert.ok(b.grounded && b.ground === lift);
  assert.ok(b.x > 250, `carried along: ${b.x}`);
});

test('resting bodies fall asleep and wake when hit', () => {
  const world = new PhysicsWorld({ allowSleep: true });
  const floor = room(world);
  const b = world.add(box(200, floor - 8));
  run(world, 60);
  assert.equal(b.awake, false);
  assert.ok(b.grounded, 'still grounded while asleep');
  world.add(box(200, floor - 80, 8, { vy: 300 }));
  run(world, 10);
  assert.equal(b.awake, true);
});
