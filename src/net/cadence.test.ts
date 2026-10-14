import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cadenceEarly, cadenceNext } from './cadence.ts';

test('an action is early only before its due time less the slack; never-taken is due at once', () => {
  assert.equal(cadenceEarly(0, undefined, 0), false);
  assert.equal(cadenceEarly(959, 1000, 40), true);
  assert.equal(cadenceEarly(960, 1000, 40), false);
});

test('the next is due a whole interval after the later of now and due', () => {
  assert.equal(cadenceNext(500, undefined, 1000), 1500);
  assert.equal(cadenceNext(960, 1000, 1000), 2000, 'arriving early does not pull the next one in');
  assert.equal(cadenceNext(1300, 1000, 1000), 2300, 'arriving late pushes it out');
});

test('a client sending every 0.8 of an interval lands no more than one per interval', () => {
  const interval = 1000;
  const slack = 0.2 * interval;
  let due: number | undefined;
  let accepted = 0;
  for (let t = 0; t < 100_000; t += 800) {
    if (cadenceEarly(t, due, slack)) continue;
    accepted++;
    due = cadenceNext(t, due, interval);
  }
  assert.ok(accepted <= 100, `${accepted}`);
  assert.ok(accepted >= 60, `${accepted}`);
});
