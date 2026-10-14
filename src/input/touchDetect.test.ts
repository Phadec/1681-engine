import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectTouch, type TouchEnv } from './touchDetect.ts';

const desktop: TouchEnv = { native: false, coarse: false, touchPoints: 0, override: null };

test('a phone browser and a native shell are touch; a desktop, even with a touch screen, is not', () => {
  assert.equal(detectTouch({ ...desktop, coarse: true, touchPoints: 5 }), true);
  assert.equal(detectTouch({ ...desktop, native: true }), true);
  assert.equal(detectTouch(desktop), false);
  assert.equal(detectTouch({ ...desktop, touchPoints: 10 }), false);
  assert.equal(detectTouch({ ...desktop, coarse: true }), false);
});

test('the override wins both ways', () => {
  assert.equal(detectTouch({ ...desktop, override: '1' }), true);
  assert.equal(detectTouch({ ...desktop, override: 'on' }), true);
  assert.equal(detectTouch({ ...desktop, native: true, override: '0' }), false);
  assert.equal(detectTouch({ ...desktop, native: true, override: 'off' }), false);
  assert.equal(detectTouch({ ...desktop, native: true, override: 'maybe' }), true);
});
