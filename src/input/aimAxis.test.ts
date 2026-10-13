import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aimAxis } from './aimAxis';

test('an aim becomes the eight-way axis a key would send', () => {
  assert.deepEqual(aimAxis(0), { dx: 1, dy: 0 });
  assert.deepEqual(aimAxis(Math.PI), { dx: -1, dy: 0 });
  // the screen's y runs down: an aim below the body is +y
  assert.deepEqual(aimAxis(Math.PI / 2), { dx: 0, dy: 1 });
  assert.deepEqual(aimAxis(-Math.PI / 4), { dx: 1, dy: -1 });
  // under 22.5° off the line it stays on the line
  assert.deepEqual(aimAxis(0.3), { dx: 1, dy: 0 });
  assert.deepEqual(aimAxis(0.5), { dx: 1, dy: 1 });
});
