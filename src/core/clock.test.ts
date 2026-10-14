import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Clock } from './Clock';
import { runDue, type DueCall } from './runDue';

test('runDue runs what is due in order, keeps the rest and empties the scratch list', () => {
  const ran: number[] = [];
  const list: DueCall[] = [3, 1, 5, 2].map((at) => ({ at, fn: () => ran.push(at) }));
  const scratch: DueCall[] = [];
  runDue(list, scratch, 2, () => assert.fail('nothing throws'));
  assert.deepEqual(ran, [1, 2]);
  assert.deepEqual(list.map((c) => c.at), [3, 5]);
  assert.equal(scratch.length, 0);
});

test('runDue drops a thrower, reports it, and still runs the calls after it', () => {
  const errors: unknown[] = [];
  const ran: string[] = [];
  const list: DueCall[] = [
    { at: 0, fn: () => ran.push('a') },
    { at: 0, fn: () => { throw new Error('boom'); } },
    { at: 0, fn: () => ran.push('c') },
  ];
  const scratch: DueCall[] = [];
  runDue(list, scratch, 0, (e) => errors.push(e));
  assert.deepEqual(ran, ['a', 'c']);
  assert.equal(errors.length, 1);
  assert.equal(list.length, 0, 'the thrower is gone, not thrown again next pass');
  runDue(list, scratch, 1, () => assert.fail('nothing left to throw'));
  assert.equal(scratch.length, 0);
});

test('runDue survives a reporter that throws', () => {
  const ran: number[] = [];
  const list: DueCall[] = [{ at: 0, fn: () => { throw new Error('x'); } }, { at: 0, fn: () => ran.push(2) }];
  const scratch: DueCall[] = [];
  const err = console.error;
  console.error = () => {};
  try {
    runDue(list, scratch, 0, () => { throw new Error('reporter'); });
  } finally {
    console.error = err;
  }
  assert.deepEqual(ran, [2]);
  assert.equal(scratch.length, 0);
});

test('runDue skips removed calls, and one removed by an earlier call of the same pass', () => {
  const ran: string[] = [];
  const b: DueCall = { at: 0, fn: () => ran.push('b') };
  const list: DueCall[] = [{ at: 0, fn: () => { ran.push('a'); b.removed = true; } }, b, { at: 0, fn: () => ran.push('c'), removed: true }];
  runDue(list, [], 0, () => {});
  assert.deepEqual(ran, ['a']);
});

test('Clock: delayedCall fires once when due, remove cancels, a call made inside waits a pass', () => {
  const c = new Clock();
  c.now = 0;
  const ran: string[] = [];
  c.delayedCall(10, () => {
    ran.push('a');
    c.delayedCall(0, () => ran.push('inner'));
  });
  const { remove } = c.delayedCall(10, () => ran.push('cancelled'));
  remove();
  c.update(5);
  assert.deepEqual(ran, []);
  c.update(10);
  assert.deepEqual(ran, ['a']);
  c.update(11);
  assert.deepEqual(ran, ['a', 'inner']);
  c.update(100);
  assert.deepEqual(ran, ['a', 'inner']);
  assert.equal(c.pending, 0);
});

test('Clock: a throwing timer goes to onError and is dropped; the rest of the frame runs', () => {
  const c = new Clock();
  c.now = 0;
  const errors: unknown[] = [];
  c.onError = (e) => errors.push(e);
  let ok = 0;
  c.delayedCall(1, () => { throw new Error('bad'); });
  c.delayedCall(1, () => ok++);
  c.update(1);
  c.update(2);
  assert.equal(errors.length, 1);
  assert.equal(ok, 1);
});

test('Clock: clear inside a timer stops the ones still due that frame', () => {
  const c = new Clock();
  c.now = 0;
  const ran: number[] = [];
  c.delayedCall(1, () => { ran.push(1); c.clear(); });
  c.delayedCall(1, () => ran.push(2));
  c.update(1);
  assert.deepEqual(ran, [1]);
  assert.equal(c.pending, 0);
});
