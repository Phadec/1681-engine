import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ViewRect } from '../../core/Camera';
import { birdFrame, boxInView, fireflyGlow, fireflyOffset, firefliesOut, flockSlot, pickInView, puffOffset, sourceOf } from './lifeMotion';

const view: ViewRect = { x: 100, y: 50, width: 200, height: 100, right: 300, bottom: 150 };

function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

test('a box is in view when it touches it, a margin widening the view', () => {
  assert.ok(boxInView({ x: 150, y: 60 }, view));
  assert.ok(boxInView({ x: 90, y: 40, w: 16, h: 16 }, view));
  assert.ok(!boxInView({ x: 80, y: 40, w: 16, h: 8 }, view));
  assert.ok(boxInView({ x: 80, y: 40, w: 16, h: 8 }, view, 4));
  assert.ok(!boxInView({ x: 301, y: 60 }, view));
});

test('a pick tries at random and gives up after its tries', () => {
  const items = [{ x: 0, y: 0 }, { x: 200, y: 100 }];
  assert.deepEqual(pickInView(items, view, seq(0, 0.9)), { x: 200, y: 100 });
  assert.equal(pickInView(items, view, seq(0), 5), null);
  assert.equal(pickInView([], view, Math.random), null);
  assert.deepEqual(sourceOf(items)(view, seq(0.6)), { x: 200, y: 100 });
});

test('birds beat five frames then glide on raised wings for three', () => {
  const frames = Array.from({ length: 8 }, (_, i) => birdFrame(i * 110, 0));
  assert.deepEqual(frames, [0, 1, 0, 1, 0, 0, 0, 0]);
});

test('a flock trails behind its leader in a V, alternating sides', () => {
  assert.deepEqual(flockSlot(0, 1, 0, 0), { dx: -0, dy: -0 });
  const a = flockSlot(1, 1, 0, 0);
  const b = flockSlot(2, 1, 0, 0);
  assert.equal(a.dx, -6);
  assert.equal(b.dx, -6);
  assert.ok(a.dy > 0 && b.dy < 0);
  assert.equal(flockSlot(3, -1, 1, 1).dx, 18);
});

test('a firefly is mostly dark, with a dim pixel either side of its glow', () => {
  let dark = 0;
  const seen = new Set<number>();
  for (let t = 0; t < 1 / 0.45; t += 0.01) {
    const g = fireflyGlow(t);
    seen.add(g);
    if (g === 0) dark++;
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
  assert.ok(dark > 100);
  assert.equal(fireflyGlow(-1), fireflyGlow(1 / 0.45 - 1));
  const o = fireflyOffset(3);
  assert.ok(Math.abs(o.dx) <= 12 && Math.abs(o.dy) <= 5);
});

test('fireflies come out with the dark', () => {
  assert.equal(firefliesOut(20, 0.49), 0);
  assert.equal(firefliesOut(20, 0.675), 10);
  assert.equal(firefliesOut(20, 0.85), 20);
  assert.equal(firefliesOut(20, 1), 20);
});

test('smoke climbs straight out, then leans downwind the older it gets', () => {
  const m = { rise: 7, drift: 9 };
  const young = puffOffset(0.2, 0.05, 0.5, 1, m);
  const old = puffOffset(4, 0.9, 0.5, 1, m);
  assert.ok(young.dy < 0 && old.dy < young.dy);
  assert.ok(old.dx > young.dx + 10);
  const still = puffOffset(4, 0.9, 0.5, 0, m);
  assert.ok(still.dx < old.dx);
});
