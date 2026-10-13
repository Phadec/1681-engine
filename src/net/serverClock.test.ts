import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noteServerTime, resetServerClock, serverOffset } from './serverClock';

test('a timed sample sets the offset to the midpoint of its round trip', () => {
  resetServerClock();
  // the server said 10_000 halfway through a 200 ms exchange that came back at device time 9_000
  noteServerTime(10_000, 200, 9_000);
  assert.equal(serverOffset(), 1_100);
});

test('a slower sample does not replace a faster fresh one, but a stale one gives way', () => {
  resetServerClock();
  noteServerTime(10_000, 50, 9_000);
  noteServerTime(20_000, 400, 9_500);
  assert.equal(serverOffset(), 1_025);
  noteServerTime(80_000, 400, 9_000 + 61_000);
  assert.equal(serverOffset(), 80_000 + 200 - 70_000);
});

test('a sample whose round trip took over two seconds is passed over', () => {
  resetServerClock();
  noteServerTime(10_000, 2_500, 9_000);
  assert.equal(serverOffset(), 0);
  noteServerTime(10_000, 200, 9_000);
  assert.equal(serverOffset(), 1_100);
});
