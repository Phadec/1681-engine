import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heartbeat, vignetteMask } from './vignetteMask';

test('the edge leaves the middle clear and fills the corners by strength', () => {
  const w = 64;
  const h = 40;
  const m = vignetteMask(w, h, 1, 0.5);
  assert.equal(m.length, w * h);
  assert.equal(m[(h / 2) * w + w / 2], 0);
  // the outer 4x4 of a corner at full strength: nearly every pixel set
  let corner = 0;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) corner += m[y * w + x]!;
  assert.ok(corner >= 10, `corner ${corner}`);
  const none = vignetteMask(w, h, 0, 0.5);
  assert.equal(none.reduce((s, v) => s + v, 0), 0);
  const half = vignetteMask(w, h, 0.5, 0.5).reduce((s, v) => s + v, 0);
  assert.ok(half > 0 && half < m.reduce((s, v) => s + v, 0));
});

test('the heartbeat quickens and deepens with urgency, in steps', () => {
  for (let t = 0; t < 2000; t += 37) {
    const v = heartbeat(t, 0.5);
    assert.ok(v >= 0 && v <= 1);
    assert.equal(Math.round(v * 6), v * 6);
  }
  // peak of the beat (15% into it) is deeper at full urgency
  assert.ok(heartbeat(75, 1, 0) > heartbeat(150, 0, 0));
});
