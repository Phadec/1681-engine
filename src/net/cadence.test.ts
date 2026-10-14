import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cadenceEarly, cadenceNext } from './cadence.ts';

test('an action never taken is due at once', () => {
  assert.equal(cadenceEarly(0, undefined, 0), false);
  assert.equal(cadenceNext(100, undefined, 500), 600);
});

test('an action inside its slack is accepted, earlier is refused', () => {
  assert.equal(cadenceEarly(950, 1000, 50), false);
  assert.equal(cadenceEarly(949, 1000, 50), true);
});

test('the next is due a whole interval after the later of now and due', () => {
  assert.equal(cadenceNext(950, 1000, 500), 1500, 'early: counted from when it was due');
  assert.equal(cadenceNext(1200, 1000, 500), 1700, 'late: counted from now');
});

test('a client sending every 0.8 of an interval lands at most one per interval', () => {
  const interval = 100;
  const slack = 20;
  let due: number | undefined;
  let accepted = 0;
  for (let now = 0; now < 10_000; now += 80) {
    if (cadenceEarly(now, due, slack)) continue;
    due = cadenceNext(now, due, interval);
    accepted++;
  }
  assert.ok(accepted <= 10_000 / interval + 1, `${accepted} accepted`);
  assert.ok(accepted >= 10_000 / interval - 30, 'the slack refused honest timing');
});
