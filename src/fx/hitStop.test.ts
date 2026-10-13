import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEAVY_FLASH_GAP_MS, hitStopMs, hurtFlashGapMs, hurtFlashMs, recoilAt, recoilPx } from './hitStop.ts';

test('a freeze-frame grows with the share of health the blow took, held to a ceiling; a crit holds longer', () => {
  assert.equal(hitStopMs(0, false), 40);
  assert.equal(hitStopMs(0.1, false), 80);
  assert.equal(hitStopMs(0.5, false), 140);
  assert.equal(hitStopMs(0.1, true), 120);
  assert.ok(hitStopMs(1, true) <= 180);
});

test('a body recoils a whole pixel or three away from the blow, a heavy body barely, and settles back', () => {
  assert.equal(recoilPx(false, 0.05, false), 2);
  assert.equal(recoilPx(false, 0.3, true), 3);
  assert.equal(recoilPx(true, 0.3, false), 1);
  assert.equal(recoilAt(3, 0), 3);
  assert.equal(recoilAt(3, 1), 0);
  assert.ok(recoilAt(3, 0.5) < 3);
  assert.ok(Number.isInteger(recoilAt(3, 0.3)));
});

test('a heavy body flashes white only for one’s own crit, briefly and spaced out; nothing flashes under reduced flashes', () => {
  assert.equal(hurtFlashMs(false, false, false), 70);
  assert.equal(hurtFlashMs(false, true, false), 140);
  assert.equal(hurtFlashMs(true, false, false), 0);
  assert.equal(hurtFlashMs(true, false, false), 0);
  assert.equal(hurtFlashMs(true, true, false), 60);
  assert.equal(hurtFlashMs(true, true, true), 0);
  assert.equal(hurtFlashMs(false, false, true), 0);
  assert.equal(hurtFlashGapMs(true), HEAVY_FLASH_GAP_MS);
  assert.equal(hurtFlashGapMs(false), 0);
});
