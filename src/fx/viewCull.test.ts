import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inView } from './viewCull.ts';

const cam = { zoom: 2, scrollX: 100, scrollY: 50, width: 400, height: 200 };

test('a point is in view inside the world rect the camera shows, widened by the margin', () => {
  // at zoom 2 the screen shows 200 × 100 world px from (100, 50)
  assert.equal(inView(cam, 100, 50, 0), true);
  assert.equal(inView(cam, 300, 150, 0), true);
  assert.equal(inView(cam, 301, 150, 0), false);
  assert.equal(inView(cam, 301, 150, 1), true);
  assert.equal(inView(cam, 90, 50, 8), false);
});

test('a camera with no size or zoom yet counts everything in', () => {
  assert.equal(inView({ zoom: 1 }, 1e6, 1e6, 0), true);
  assert.equal(inView({ ...cam, zoom: 0 }, 1e6, 1e6, 0), true);
});
