import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INPUT_FLAG_DASH, type InputStep, type MovementParams } from './constants.ts';
import { blocksShot, createCollisionGrid, createMover, stepMover } from './movement.ts';

const params: MovementParams = { speed: 60, dashSpeed: 180, dashSteps: 6, dashCooldownSteps: 30, canMove: true, canDash: true };

/** A 10×10 room of 16-px tiles, walled round. */
function room(extra: (x: number, y: number) => boolean = () => false): string {
  let s = '';
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) s += x === 0 || y === 0 || x === 9 || y === 9 || extra(x, y) ? '1' : '0';
  return s;
}

test('the same steps give the same position, bit for bit', () => {
  const grid = createCollisionGrid(10, 10, 16, room());
  const steps: InputStep[] = Array.from({ length: 300 }, (_, i) => [Math.sign(Math.sin(i / 7)), Math.sign(Math.cos(i / 11)), i % 50 === 0 ? INPUT_FLAG_DASH : 0]);
  const run = () => {
    const m = createMover(80, 80);
    for (const s of steps) stepMover(m, s, params, grid);
    return [m.x, m.y];
  };
  assert.deepEqual(run(), run());
});

test('a body walking into a wall stops flush against it', () => {
  const grid = createCollisionGrid(10, 10, 16, room());
  const m = createMover(80, 80);
  for (let i = 0; i < 600; i++) stepMover(m, [1, 0, 0], params, grid);
  // the wall column starts at x = 144; the body's right edge stops just short of it
  assert.ok(m.x + grid.bodyHalfWidth < 144 && m.x + grid.bodyHalfWidth > 143.9, `stopped at ${m.x}`);
});

test('the body size is a grid option', () => {
  const grid = createCollisionGrid(10, 10, 16, room(), { bodyHalfWidth: 7, bodyHalfHeight: 4 });
  const m = createMover(80, 80);
  for (let i = 0; i < 600; i++) stepMover(m, [-1, 0, 0], params, grid);
  assert.ok(m.x - 7 > 16 && m.x - 7 < 16.1, `stopped at ${m.x}`);
});

test('a diagonal is no faster than a straight line', () => {
  const grid = createCollisionGrid(10, 10, 16, room());
  const a = createMover(40, 40);
  const b = createMover(40, 40);
  for (let i = 0; i < 30; i++) {
    stepMover(a, [1, 0, 0], params, grid);
    stepMover(b, [1, 1, 0], params, grid);
  }
  const straight = a.x - 40;
  const diagonal = Math.hypot(b.x - 40, b.y - 40);
  assert.ok(Math.abs(straight - diagonal) < 1e-6);
});

test('a roll is committed: input neither steers it nor starts another until its cooldown', () => {
  const grid = createCollisionGrid(10, 10, 16, room());
  const m = createMover(40, 80);
  stepMover(m, [1, 0, INPUT_FLAG_DASH], params, grid);
  const y = m.y;
  for (let i = 0; i < params.dashSteps - 1; i++) stepMover(m, [0, 1, INPUT_FLAG_DASH], params, grid);
  assert.equal(m.y, y, 'the roll was steered');
  assert.equal(m.dashLeft, 0);
  stepMover(m, [1, 0, INPUT_FLAG_DASH], params, grid);
  assert.equal(m.dashLeft, 0, 'a roll started inside the cooldown');
});

test('a shot flies over the tiles named for it and stops on every other solid tile', () => {
  const WATER = 7;
  const solid = room((x, y) => x === 5 && y === 5);
  const ground = Array.from({ length: 100 }, (_, i) => (i === 55 ? WATER : 0));
  const grid = createCollisionGrid(10, 10, 16, solid, { ground, shotOverTiles: [WATER] });
  assert.equal(blocksShot(grid, 5, 5), false);
  assert.equal(blocksShot(grid, 0, 0), true);
  assert.equal(blocksShot(grid, 3, 3), false, 'open ground never blocks');
});

test('a collision string of the wrong length is refused', () => {
  assert.throws(() => createCollisionGrid(4, 4, 16, '0000'), /length/);
});

test('the dash bit and the step length are params, defaulting to INPUT_FLAG_DASH and 1/60 s', () => {
  const grid = createCollisionGrid(10, 10, 16, room());
  const custom: MovementParams = { ...params, dashFlag: 4 };
  const a = createMover(40, 80);
  stepMover(a, [1, 0, INPUT_FLAG_DASH], custom, grid);
  assert.equal(a.dashLeft, 0, 'the default bit started a dash under a custom one');
  stepMover(a, [1, 0, 4], custom, grid);
  assert.equal(a.dashLeft, params.dashSteps - 1);

  const half = createMover(40, 80);
  const whole = createMover(40, 80);
  stepMover(half, [1, 0, 0], { ...params, stepDt: 1 / 120 }, grid);
  stepMover(whole, [1, 0, 0], params, grid);
  assert.ok(Math.abs((half.x - 40) * 2 - (whole.x - 40)) < 1e-9);
});

test('the tile size is the grid\'s own', () => {
  const grid = createCollisionGrid(10, 10, 32, room());
  const m = createMover(160, 160);
  for (let i = 0; i < 600; i++) stepMover(m, [1, 0, 0], params, grid);
  assert.ok(m.x + grid.bodyHalfWidth < 288 && m.x + grid.bodyHalfWidth > 287.9, `stopped at ${m.x}`);
});
