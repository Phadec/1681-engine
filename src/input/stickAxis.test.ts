import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STICK_DEAD_ZONE, stickActive, stickToAxis, stickVector } from './stickAxis.ts';

test('the vector is the offset over the radius, and never longer than 1', () => {
  assert.deepEqual(stickVector(20, 0, 40), { x: 0.5, y: 0 });
  const far = stickVector(300, 400, 50);
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 1) < 1e-12);
  assert.ok(Math.abs(far.x - 0.6) < 1e-12);
  assert.deepEqual(stickVector(0, 0, 40), { x: 0, y: 0 });
  assert.deepEqual(stickVector(5, 5, 0), { x: 0, y: 0 });
});

test('inside the dead zone the stick rests', () => {
  assert.equal(stickActive({ x: STICK_DEAD_ZONE - 0.01, y: 0 }), false);
  assert.equal(stickActive({ x: STICK_DEAD_ZONE, y: 0 }), true);
  assert.deepEqual(stickToAxis({ x: 0.1, y: 0.1 }), { dx: 0, dy: 0 });
  assert.deepEqual(stickToAxis({ x: 0.1, y: 0 }, 0.05), { dx: 1, dy: 0 });
});

test('the axis is the nearest of eight directions, y down', () => {
  const at = (deg: number) => stickToAxis({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
  assert.deepEqual(at(0), { dx: 1, dy: 0 });
  assert.deepEqual(at(20), { dx: 1, dy: 0 }, 'a little off the horizontal walks straight');
  assert.deepEqual(at(25), { dx: 1, dy: 1 });
  assert.deepEqual(at(90), { dx: 0, dy: 1 });
  assert.deepEqual(at(-90), { dx: 0, dy: -1 });
  assert.deepEqual(at(180), { dx: -1, dy: 0 });
  assert.deepEqual(at(-135), { dx: -1, dy: -1 });
  for (let d = -180; d <= 180; d += 7) {
    const a = at(d);
    assert.ok([a.dx, a.dy].every((v) => v === -1 || v === 0 || v === 1));
    assert.ok(a.dx !== 0 || a.dy !== 0);
  }
});
