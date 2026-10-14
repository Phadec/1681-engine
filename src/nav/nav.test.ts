import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCollisionGrid } from '../net/movement.ts';
import { findPath, floodFill, reachedCount } from './findPath.ts';
import { MinHeap } from './MinHeap.ts';
import { navGrid, navGridFromCollision, nearWallCost, type NavGrid, type TilePoint } from './navGrid.ts';
import { nearestOpen } from './nearestOpen.ts';
import { simplifyPath, straightenPath } from './straightenPath.ts';

/** A grid drawn as text: '#' is a wall, anything else open. */
function grid(rows: string[]): NavGrid {
  return navGrid(rows[0]!.length, rows.length, (x, y) => rows[y]![x] !== '#');
}

function pathCost(path: TilePoint[], cost?: (x: number, y: number) => number): number {
  let c = 0;
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1]!;
    const b = path[k]!;
    c += (a.x !== b.x && a.y !== b.y ? Math.SQRT2 : 1) + (cost ? cost(b.x, b.y) : 0);
  }
  return c;
}

function stepsAreLegal(g: NavGrid, path: TilePoint[]): boolean {
  return path.every((p, k) => {
    if (!g.walkable(p.x, p.y)) return false;
    if (k === 0) return true;
    const a = path[k - 1]!;
    return Math.max(Math.abs(p.x - a.x), Math.abs(p.y - a.y)) === 1;
  });
}

test('the heap pops in priority order', () => {
  const h = new MinHeap();
  [5, 1, 4, 2, 3].forEach((p) => h.push(p * 10, p));
  const out: number[] = [];
  while (h.size) out.push(h.pop());
  assert.deepEqual(out, [10, 20, 30, 40, 50]);
});

test('a path goes round a wall and never cuts its corner', () => {
  const g = grid([
    '.....',
    '.###.',
    '...#.',
    '.#.#.',
    '.....',
  ]);
  const path = findPath(g, { x: 2, y: 2 }, { x: 4, y: 2 })!;
  assert.ok(path);
  assert.deepEqual(path[0], { x: 2, y: 2 });
  assert.deepEqual(path[path.length - 1], { x: 4, y: 2 });
  assert.ok(stepsAreLegal(g, path));
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1]!;
    const b = path[k]!;
    if (a.x !== b.x && a.y !== b.y) assert.ok(g.walkable(b.x, a.y) && g.walkable(a.x, b.y), 'cut a corner');
  }
});

test('no path into a walled-off room', () => {
  const g = grid([
    '.....',
    '.###.',
    '.#.#.',
    '.###.',
    '.....',
  ]);
  assert.equal(findPath(g, { x: 0, y: 0 }, { x: 2, y: 2 }), null);
  // but reaching within a tile and a half of it is enough
  const near = findPath(g, { x: 0, y: 0 }, { x: 2, y: 2, reach: 2 })!;
  assert.ok(near);
  const end = near[near.length - 1]!;
  assert.ok(Math.hypot(end.x - 2, end.y - 2) <= 2);
});

test('an end-only tile is a destination, never a way through', () => {
  const g = grid(['.....']);
  const door = (x: number, y: number) => x === 2 && y === 0;
  assert.equal(findPath(g, { x: 0, y: 0 }, { x: 4, y: 0 }, { endOnly: door }), null);
  assert.equal(findPath(g, { x: 0, y: 0 }, { x: 2, y: 0 }, { endOnly: door })!.length, 3);
});

test('straightening keeps the cost and takes fewer turns', () => {
  const rows = Array.from({ length: 20 }, (_, y) => '.'.repeat(30).split('').map((c, x) => (y === 10 && x > 3 && x < 26 ? '#' : c)).join(''));
  const g = grid(rows);
  const cost = nearWallCost(g);
  for (const [from, to] of [
    [{ x: 0, y: 0 }, { x: 29, y: 19 }],
    [{ x: 15, y: 2 }, { x: 15, y: 18 }],
    [{ x: 2, y: 17 }, { x: 27, y: 3 }],
  ] as const) {
    const path = findPath(g, from, to, { cost })!;
    const straight = straightenPath(g, path, { cost });
    assert.ok(stepsAreLegal(g, straight));
    assert.deepEqual(straight[0], path[0]);
    assert.deepEqual(straight[straight.length - 1], path[path.length - 1]);
    assert.ok(pathCost(straight, cost) <= pathCost(path, cost) + 1e-6, 'straightening made it dearer');
    assert.ok(simplifyPath(straight).length <= simplifyPath(path).length, 'straightening added turns');
  }
});

test('a staircase on open ground becomes one diagonal and one straight run', () => {
  const g = grid(Array.from({ length: 8 }, () => '........'));
  const stairs: TilePoint[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 3 }];
  const straight = straightenPath(g, stairs);
  assert.equal(simplifyPath(straight).length, 3);
  assert.ok(Math.abs(pathCost(straight) - pathCost(stairs)) < 1e-9);
});

test('a flood reaches every open tile joined to the start, and no other', () => {
  const g = grid([
    '..#..',
    '..#..',
    '###..',
    '.....',
  ]);
  const costs = floodFill(g, { x: 0, y: 0 });
  assert.equal(reachedCount(costs), 4);
  assert.equal(costs[0], 0);
  assert.ok(Math.abs(costs[1 * 5 + 1]! - Math.SQRT2) < 1e-6);
  assert.equal(reachedCount(floodFill(g, { x: 4, y: 0 })), 11);
  assert.equal(reachedCount(floodFill(g, { x: 4, y: 0 }, { maxCost: 1 })), 3);
});

test('the nearest open tile is the closest on its ring', () => {
  const g = grid([
    '#####',
    '#####',
    '##.##',
    '#####',
    '.####',
  ]);
  assert.deepEqual(nearestOpen(g, 1, 1), { x: 2, y: 2 });
  assert.deepEqual(nearestOpen(g, 2, 2), { x: 2, y: 2 });
  assert.equal(nearestOpen(grid(['###']), 1, 0, 3), null);
});

test('the engine collision grid is searchable as it is', () => {
  const solid = ['00000', '01110', '00000'].join('');
  const g = navGridFromCollision(createCollisionGrid(5, 3, 16, solid));
  const path = findPath(g, { x: 0, y: 1 }, { x: 4, y: 1 })!;
  assert.ok(path && stepsAreLegal(g, path));
  assert.ok(path.every((p) => p.y !== 1 || p.x === 0 || p.x === 4));
});
