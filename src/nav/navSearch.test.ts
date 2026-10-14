import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findPath, floodFill, octile, reachedCount } from './findPath.ts';
import { MinHeap } from './MinHeap.ts';
import { canStep, isOpen, navGrid, nearWallCost, type NavGrid, type TilePoint } from './navGrid.ts';
import { nearestOpen } from './nearestOpen.ts';
import { simplifyPath, straightenPath } from './straightenPath.ts';

function grid(rows: string[]): NavGrid {
  return navGrid(rows[0]!.length, rows.length, (x, y) => rows[y]![x] !== '#');
}

/** A small seeded generator, so a failing grid can be drawn again. */
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

function randomGrid(seed: number, w: number, h: number, walls: number): NavGrid {
  const r = rng(seed);
  const solid = Array.from({ length: w * h }, () => r() < walls);
  return navGrid(w, h, (x, y) => !solid[y * w + x]);
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

function legal(g: NavGrid, path: TilePoint[], endOnly?: (x: number, y: number) => boolean): boolean {
  const last = path[path.length - 1]!;
  const isGoal = (x: number, y: number) => x === last.x && y === last.y;
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1]!;
    const b = path[k]!;
    if (Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) !== 1) return false;
    if (!canStep(g, a.x, a.y, b.x - a.x, b.y - a.y, endOnly, isGoal)) return false;
  }
  return true;
}

test('octile distance is the cost of the cheapest walk on open ground', () => {
  assert.equal(octile(0, 0), 0);
  assert.equal(octile(3, 0), 3);
  assert.equal(octile(0, -4), 4);
  assert.ok(Math.abs(octile(2, 2) - 2 * Math.SQRT2) < 1e-12);
  assert.ok(Math.abs(octile(-5, 2) - (3 + 2 * Math.SQRT2)) < 1e-12);
});

test('on random ground A* finds the same cost as the flood, and a path exactly when the flood reaches', () => {
  let reached = 0;
  let walledOff = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = randomGrid(seed, 18, 14, 0.28);
    const cost = seed % 2 ? nearWallCost(g) : undefined;
    const r = rng(seed * 7);
    const from = { x: Math.floor(r() * 18), y: Math.floor(r() * 14) };
    const to = { x: Math.floor(r() * 18), y: Math.floor(r() * 14) };
    if (!isOpen(g, from.x, from.y) || !isOpen(g, to.x, to.y)) continue;
    const flood = floodFill(g, from, { cost });
    const path = findPath(g, from, to, { cost });
    const want = flood[to.y * 18 + to.x]!;
    if (want === Infinity) {
      assert.equal(path, null, `seed ${seed}: a path the flood never reached`);
      walledOff++;
      continue;
    }
    assert.ok(path, `seed ${seed}: no path where the flood got through`);
    assert.ok(legal(g, path), `seed ${seed}: an illegal step`);
    assert.ok(Math.abs(pathCost(path, cost) - want) < 1e-3, `seed ${seed}: ${pathCost(path, cost)} vs ${want}`);
    const straight = straightenPath(g, path, { cost });
    assert.ok(legal(g, straight), `seed ${seed}: straightening stepped where the search could not`);
    assert.ok(pathCost(straight, cost) <= pathCost(path, cost) + 1e-6);
    reached++;
  }
  assert.ok(reached >= 10 && walledOff >= 1, `too few cases: ${reached} reached, ${walledOff} walled off`);
});

test('a cost steers the route without making it illegal', () => {
  const g = grid([
    '.....',
    '.....',
    '.....',
  ]);
  // the middle row is dear: the route goes along the top
  const cost = (_x: number, y: number) => (y === 1 ? 10 : 0);
  const path = findPath(g, { x: 0, y: 0 }, { x: 4, y: 0 }, { cost })!;
  assert.ok(path.every((p) => p.y === 0));
  const forced = findPath(g, { x: 0, y: 0 }, { x: 0, y: 2 }, { cost })!;
  assert.deepEqual(forced, [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }]);
});

test('the search gives up after maxNodes rather than stall a frame', () => {
  const g = grid(Array.from({ length: 40 }, () => '.'.repeat(40)));
  assert.ok(findPath(g, { x: 0, y: 0 }, { x: 39, y: 39 }));
  assert.equal(findPath(g, { x: 0, y: 0 }, { x: 39, y: 39 }, { maxNodes: 10 }), null);
  let asked = 0;
  const walled = navGrid(60, 60, (x, y) => {
    asked++;
    return !(x === 50 && y === 50) && !(Math.max(Math.abs(x - 50), Math.abs(y - 50)) === 1);
  });
  // the goal sits in a sealed box; with a budget the search stops well short of the whole map
  assert.equal(findPath(walled, { x: 0, y: 0 }, { x: 50, y: 50 }, { maxNodes: 200 }), null);
  assert.ok(asked < 200 * 8 * 4);
});

test('a start inside a wall walks out from the nearest open tile; with none near, there is no path', () => {
  const g = grid([
    '###..',
    '###..',
    '###..',
  ]);
  const path = findPath(g, { x: 1, y: 1 }, { x: 4, y: 1 })!;
  assert.deepEqual(path[0], { x: 3, y: 1 });
  const solid = navGrid(30, 30, () => false);
  assert.equal(findPath(solid, { x: 15, y: 15 }, { x: 0, y: 0 }), null);
  assert.equal(reachedCount(floodFill(solid, { x: 15, y: 15 })), 0);
});

test('a start already at the goal is a path of one tile', () => {
  const g = grid(['...']);
  assert.deepEqual(findPath(g, { x: 1, y: 0 }, { x: 1, y: 0 }), [{ x: 1, y: 0 }]);
  assert.deepEqual(findPath(g, { x: 1, y: 0 }, { x: 2, y: 0, reach: 1 }), [{ x: 1, y: 0 }]);
});

test('a custom goal ends on the first tile it accepts, the nearest by cost', () => {
  const g = grid([
    '.......',
    '.......',
    '.......',
  ]);
  // any tile of the last column
  const path = findPath(g, { x: 0, y: 1 }, { test: (x) => x === 6, estimate: (x) => 6 - x })!;
  assert.equal(path.length, 7);
  assert.deepEqual(path[path.length - 1], { x: 6, y: 1 });
  // without an estimate it is a Dijkstra, and still exact
  const plain = findPath(g, { x: 0, y: 1 }, { test: (x, y) => x === 3 && y === 0 })!;
  assert.ok(Math.abs(pathCost(plain) - (2 + Math.SQRT2)) < 1e-9);
});

test('a start on an end-only tile may leave it; a diagonal never brushes one', () => {
  const g = grid([
    '...',
    '...',
  ]);
  const door = (x: number, y: number) => x === 1 && y === 0;
  const fromDoor = findPath(g, { x: 1, y: 0 }, { x: 2, y: 1 }, { endOnly: door })!;
  assert.equal(fromDoor.length, 2);
  // (0,1) → (1,0)'s neighbour diagonal would brush the door at (1,0)
  const along = findPath(g, { x: 0, y: 0 }, { x: 2, y: 0 }, { endOnly: door })!;
  assert.ok(along.every((p) => !door(p.x, p.y)));
  assert.ok(legal(g, along, door));
  assert.equal(canStep(g, 0, 1, 1, -1, door, () => false), false, 'the diagonal from (0,1) to (1,0) lands on the door');
  assert.equal(canStep(g, 0, 0, 1, 1, door, () => false), false, 'the diagonal from (0,0) to (1,1) brushes the door');
  assert.equal(canStep(g, 0, 0, 1, 1, door, (x, y) => x === 1 && y === 0), true, 'unless the door is the goal');
});

test('a flood gives an end-only tile a cost but goes no further through it', () => {
  const g = grid(['.....']);
  const door = (x: number, y: number) => x === 2 && y === 0;
  const costs = floodFill(g, { x: 0, y: 0 }, { endOnly: door });
  assert.equal(costs[2], 2);
  assert.equal(costs[3], Infinity);
  // standing on the door, the flood still spreads out of it
  assert.equal(reachedCount(floodFill(g, { x: 2, y: 0 }, { endOnly: door })), 5);
});

test('straightening never steps onto an end-only tile short of the end, nor through a wall', () => {
  const g = grid([
    '......',
    '......',
    '......',
    '......',
  ]);
  const door = (x: number, y: number) => x === 2 && y === 2;
  const stairs: TilePoint[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 2 },
    { x: 4, y: 3 },
  ];
  const straight = straightenPath(g, stairs, { endOnly: door });
  assert.ok(straight.every((p) => !door(p.x, p.y)));
  assert.ok(legal(g, straight, door));
  assert.deepEqual(straight[straight.length - 1], { x: 4, y: 3 });
  assert.deepEqual(straightenPath(g, stairs.slice(0, 2)), stairs.slice(0, 2), 'two tiles are left as they are');
});

test('simplify keeps the corners and the ends only', () => {
  const l: TilePoint[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }];
  assert.deepEqual(simplifyPath(l), [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 4 }]);
  assert.deepEqual(simplifyPath([{ x: 1, y: 1 }]), [{ x: 1, y: 1 }]);
});

test('the nearest open tile honours a narrower test and its radius', () => {
  const g = grid([
    '.....',
    '.....',
    '.....',
  ]);
  const notCentre = (x: number, y: number) => isOpen(g, x, y) && !(x === 2 && y === 1);
  const p = nearestOpen(g, 2, 1, 3, notCentre)!;
  assert.equal(Math.hypot(p.x - 2, p.y - 1), 1, 'a straight neighbour beats a diagonal one');
  assert.equal(nearestOpen(g, 20, 20, 2), null, 'too far from any open tile');
});

test('a wall beside a tile makes it dearer by nearWallCost; open ground costs nothing', () => {
  const g = grid([
    '#....',
    '.....',
    '.....',
  ]);
  const cost = nearWallCost(g, 2);
  assert.equal(cost(1, 0), 2, 'beside the rock');
  assert.equal(cost(2, 1), 0);
  assert.equal(cost(4, 1), 2, 'the edge of the map is a wall');
});

test('the heap stays ordered under many pushes and pops, stale entries included', () => {
  const h = new MinHeap();
  const r = rng(99);
  const kept: number[] = [];
  for (let round = 0; round < 50; round++) {
    for (let k = 0; k < 40; k++) {
      const p = Math.floor(r() * 1000);
      h.push(p, p);
      kept.push(p);
    }
    kept.sort((a, b) => a - b);
    for (let k = 0; k < 25; k++) assert.equal(h.pop(), kept.shift());
  }
  assert.equal(h.size, kept.length);
  h.clear();
  assert.equal(h.size, 0);
});
