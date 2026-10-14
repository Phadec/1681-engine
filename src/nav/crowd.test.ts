import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findPath } from './findPath.ts';
import { flowField, followField } from './flowField.ts';
import { navGrid, nearWallCost, type NavGrid, type TilePoint } from './navGrid.ts';
import { alignment, applySteering, arrive, cohesion, combineSteering, flee, followFlow, seek, separation, type SteerAgent } from './steering.ts';

function grid(rows: string[]): NavGrid {
  return navGrid(rows[0]!.length, rows.length, (x, y) => rows[y]![x] !== '#');
}

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

function pathCost(path: TilePoint[], cost?: (x: number, y: number) => number): number {
  let c = 0;
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1]!;
    const b = path[k]!;
    c += (a.x !== b.x && a.y !== b.y ? Math.SQRT2 : 1) + (cost ? cost(b.x, b.y) : 0);
  }
  return c;
}

test('following the field from anywhere costs what findPath finds, and reaches a goal', () => {
  let checked = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const r = rng(seed);
    const solid = Array.from({ length: 20 * 15 }, () => r() < 0.25);
    const g = navGrid(20, 15, (x, y) => !solid[y * 20 + x]);
    const cost = seed % 2 ? nearWallCost(g) : undefined;
    const goal = { x: Math.floor(r() * 20), y: Math.floor(r() * 15) };
    if (!g.walkable(goal.x, goal.y)) continue;
    const field = flowField(g, [goal], { cost });
    for (let k = 0; k < 10; k++) {
      const from = { x: Math.floor(r() * 20), y: Math.floor(r() * 15) };
      if (!g.walkable(from.x, from.y)) continue;
      const route = followField(field, from);
      const path = findPath(g, from, goal, { cost });
      if (!path) {
        assert.equal(route, null, `seed ${seed}: the field reaches where findPath does not`);
        continue;
      }
      assert.ok(route, `seed ${seed}: findPath reaches where the field does not`);
      assert.deepEqual(route.at(-1), goal);
      assert.ok(Math.abs(pathCost(route, cost) - pathCost(path, cost)) < 1e-3, `seed ${seed}: ${pathCost(route, cost)} vs ${pathCost(path, cost)}`);
      assert.ok(Math.abs(field.costAt(from.x, from.y) - pathCost(path, cost)) < 1e-3);
      checked++;
    }
  }
  assert.ok(checked > 40, `only ${checked}`);
});

test('with several goals each tile flows to its nearest', () => {
  const g = grid(['.........']);
  const field = flowField(g, [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
  ]);
  assert.deepEqual(field.stepAt(2, 0), [-1, 0]);
  assert.deepEqual(field.stepAt(6, 0), [1, 0]);
  assert.equal(field.stepAt(0, 0), null, 'a goal has nowhere to go');
  assert.equal(field.costAt(4, 0), 4);
});

test('no corner is cut, end-only tiles are not crossed, and walls and far tiles get no step', () => {
  const g = grid([
    '...#',
    '.#..',
    '....',
  ]);
  const field = flowField(g, [{ x: 3, y: 1 }]);
  assert.equal(field.stepAt(3, 0), null, 'a wall');
  const route = followField(field, { x: 0, y: 0 })!;
  for (let k = 1; k < route.length; k++) {
    const a = route[k - 1]!;
    const b = route[k]!;
    if (a.x !== b.x && a.y !== b.y) assert.ok(g.walkable(b.x, a.y) && g.walkable(a.x, b.y), 'cut a corner');
  }
  const door = (x: number, y: number) => x === 2 && y === 0;
  const line = grid(['.....']);
  const blocked = flowField(line, [{ x: 4, y: 0 }], { endOnly: door });
  assert.equal(blocked.costAt(0, 0), Infinity, 'the door is never walked through');
  assert.equal(blocked.costAt(3, 0), 1);
  const toDoor = flowField(line, [{ x: 2, y: 0 }], { endOnly: door });
  assert.equal(toDoor.costAt(0, 0), 2, 'but a door may be the goal');
  const capped = flowField(line, [{ x: 0, y: 0 }], { maxCost: 2 });
  assert.equal(capped.costAt(3, 0), Infinity);
  assert.equal(capped.stepAt(3, 0), null);
  assert.equal(flowField(line, [{ x: -5, y: 0 }]).costAt(0, 0), Infinity, 'a goal off the grid is ignored');
  assert.equal(capped.costAt(99, 0), Infinity);
  assert.equal(capped.stepAt(-1, 0), null);
});

const agent = (x = 0, y = 0, vx = 0, vy = 0): SteerAgent => ({ x, y, vx, vy });

test('seek and flee point at and away from the target; arrive slows inside its radius', () => {
  assert.deepEqual(seek(agent(), 10, 0, 50), { x: 50, y: 0 });
  assert.deepEqual(seek(agent(0, 0, 50, 0), 10, 0, 50), { x: 0, y: 0 }, 'already going there');
  assert.deepEqual(flee(agent(), 10, 0, 50), { x: -50, y: 0 });
  assert.deepEqual(flee(agent(), 100, 0, 50, 20), { x: 0, y: 0 }, 'outside the panic radius');
  assert.deepEqual(arrive(agent(), 5, 0, 50, 10), { x: 25, y: 0 });
  assert.deepEqual(arrive(agent(), 50, 0, 50, 10), { x: 50, y: 0 });
  assert.deepEqual(arrive(agent(0, 0, 3, 4), 0, 0, 50, 10), { x: -3, y: -4 }, 'on the spot it brakes');
});

test('separation pushes apart, harder up close, and parts two bodies on one spot', () => {
  const me = agent(0, 0);
  const near = agent(2, 0);
  const far = agent(8, 0);
  const a = separation(me, [me, near], 10, 100);
  const b = separation(me, [me, far], 10, 100);
  assert.ok(a.x < b.x && b.x < 0, 'pushed left, more by the nearer one');
  assert.deepEqual(separation(me, [agent(20, 0)], 10, 100), { x: 0, y: 0 });
  const twin = agent(0, 0);
  const s = separation(me, [twin], 10, 100);
  assert.ok(Math.hypot(s.x, s.y) > 99, 'a body on the very spot is pushed off at full strength');
});

test('a flock aligns its heading and draws together', () => {
  const me = agent(0, 0, 0, 0);
  const flock = [agent(10, 0, 10, 0), agent(0, 10, 10, 0), agent(500, 500, -99, 0)];
  assert.deepEqual(alignment(me, flock, 50), { x: 10, y: 0 });
  const c = cohesion(me, flock, 50, 10);
  assert.ok(c.x > 0 && c.y > 0 && Math.abs(c.x - c.y) < 1e-9, 'towards the middle of the two near ones');
  assert.deepEqual(alignment(me, [], 50), { x: 0, y: 0 });
});

test('forces are weighed and capped; a crowd following a field gets to the goal without stacking up', () => {
  const capped = combineSteering(10, [{ x: 30, y: 0 }, 1], [{ x: 0, y: 40 }, 1]);
  assert.ok(Math.abs(Math.hypot(capped.x, capped.y) - 10) < 1e-9);
  assert.deepEqual(combineSteering(100, [{ x: 3, y: 0 }, 2], [{ x: 1, y: 1 }, -1]), { x: 5, y: -1 });

  const g = grid([
    '..........',
    '..........',
    '..........',
    '..........',
  ]);
  const field = flowField(g, [{ x: 9, y: 2 }]);
  const crowd = Array.from({ length: 6 }, (_, i) => agent(8 + (i % 3) * 3, 8 + Math.floor(i / 3) * 3));
  for (let step = 0; step < 600; step++) {
    for (const a of crowd) {
      const f = combineSteering(400, [followFlow(a, field, 16, 40), 1], [separation(a, crowd, 10, 200), 1]);
      applySteering(a, f, 40, 1 / 60);
    }
  }
  for (const a of crowd) assert.ok(Math.hypot(a.x - (9 * 16 + 8), a.y - (2 * 16 + 8)) < 40, `left at ${a.x},${a.y}`);
  for (let i = 0; i < crowd.length; i++)
    for (let j = i + 1; j < crowd.length; j++) assert.ok(Math.hypot(crowd[i]!.x - crowd[j]!.x, crowd[i]!.y - crowd[j]!.y) > 3, 'two stacked up');
  for (const a of crowd) assert.ok(Math.hypot(a.vx, a.vy) <= 40 + 1e-9, 'over the speed cap');
});

test('a body shoved off the field heads back onto it; one far from it, or on the goal, brakes', () => {
  const g = grid(['#....']);
  const field = flowField(g, [{ x: 4, y: 0 }]);
  // standing in the wall at tile 0: back to tile 1
  const f = followFlow(agent(8, 8), field, 16, 40);
  assert.ok(f.x > 0);
  const lost = followFlow(agent(-200, 8, 5, 5), field, 16, 40);
  assert.deepEqual(lost, { x: -5, y: -5 });
  assert.deepEqual(followFlow(agent(4 * 16 + 8, 8, 3, 0), field, 16, 40), { x: -3, y: -0 });
});
