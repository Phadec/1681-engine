import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Graphics } from '../core/Graphics';
import { pixelOn, spark, tail } from './pixelParticles';

/** A stand-in Graphics recording which whole pixels were filled. */
function recorder(): { g: Graphics; cells: Set<string> } {
  const cells = new Set<string>();
  const g = {
    fillStyle() {
      return g;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.add(`${x + dx},${y + dy}`);
      return g;
    },
  };
  return { g: g as unknown as Graphics, cells };
}

test('spark: one pixel, a plus, and a star whose arms twinkle with the frame', () => {
  const one = recorder();
  spark(one.g, 3, 4, 0x66ccff, 1);
  assert.deepEqual([...one.cells], ['3,4']);
  const plus = recorder();
  spark(plus.g, 0, 0, 0x66ccff, 2);
  assert.equal(plus.cells.size, 5);
  const star0 = recorder();
  spark(star0.g, 0, 0, 0x66ccff, 3, 0);
  const star1 = recorder();
  spark(star1.g, 0, 0, 0x66ccff, 3, 1);
  assert.equal(star0.cells.size, 9);
  assert.equal(star1.cells.size, 13);
});

test('tail runs back against the velocity, its far half broken up, and a thick one gains a shaded row below', () => {
  const thin = recorder();
  tail(thin.g, 10, 0, 1, 0, 8, 0xffaa33);
  for (const c of thin.cells) assert.ok(Number(c.split(',')[0]) <= 10 && c.endsWith(',0'), c);
  assert.ok(thin.cells.has('10,0') && thin.cells.has('2,0'));
  assert.ok(!thin.cells.has('3,0'), 'the far half is every other pixel');
  const thick = recorder();
  tail(thick.g, 10, 0, 1, 0, 8, 0xffaa33, 2);
  assert.ok(thick.cells.has('10,1'), 'shaded side is down for a level flight');
  assert.ok(!thick.cells.has('10,-1'));
  const still = recorder();
  tail(still.g, 1, 1, 0, 0, 8, 0xffaa33);
  assert.deepEqual([...still.cells], ['1,1']);
});

test('pixelOn places pixels along and across a heading', () => {
  const r = recorder();
  const px = pixelOn(r.g, 5, 5, Math.PI / 2);
  px(3, 0, 0xffffff);
  px(0, 2, 0xffffff);
  assert.ok(r.cells.has('5,8'), 'along a downward heading');
  assert.ok(r.cells.has('3,5'), 'across is to the right of the heading');
});
