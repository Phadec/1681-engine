import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LongPress } from './longPress.ts';

test('a finger held still fires once, where it went down', () => {
  const lp = new LongPress(500, 10);
  lp.down(1, 40, 60, 1000);
  assert.equal(lp.fire(1499), null);
  assert.deepEqual(lp.fire(1500), { x: 40, y: 60 });
  assert.equal(lp.fire(2000), null, 'once per press');
  lp.up(1);
  lp.down(1, 0, 0, 3000);
  assert.deepEqual(lp.fire(3600), { x: 0, y: 0 }, 'a new press fires again');
});

test('moving past the slop or lifting early is not a long press', () => {
  const lp = new LongPress(500, 10);
  lp.down(1, 0, 0, 0);
  lp.move(1, 6, 8); // exactly 10: still within
  assert.deepEqual(lp.fire(500), { x: 0, y: 0 });
  lp.up(1);
  lp.down(1, 0, 0, 1000);
  lp.move(1, 11, 0);
  assert.equal(lp.fire(2000), null);
  lp.up(1);
  lp.down(1, 0, 0, 3000);
  lp.up(1);
  assert.equal(lp.fire(4000), null);
});

test('another finger\'s move does not cancel it; a second finger does', () => {
  const lp = new LongPress(500, 10);
  lp.down(1, 0, 0, 0);
  lp.move(2, 100, 100);
  assert.deepEqual(lp.fire(600), { x: 0, y: 0 });
  lp.up(1);
  lp.down(1, 0, 0, 1000);
  lp.down(2, 50, 50, 1100);
  assert.equal(lp.fire(2000), null);
  // both lift: the next single finger is a fresh press
  lp.up(2);
  lp.up(1);
  lp.down(3, 5, 5, 3000);
  assert.deepEqual(lp.fire(3500), { x: 5, y: 5 });
});
