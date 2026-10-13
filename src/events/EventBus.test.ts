import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventBus } from './EventBus.ts';

interface Events {
  hit: { amount: number };
  done: undefined;
}

test('listeners run in subscription order and can unsubscribe', () => {
  const bus = new EventBus<Events>();
  const got: string[] = [];
  bus.on('hit', (p) => got.push(`a${p.amount}`));
  const off = bus.on('hit', (p) => got.push(`b${p.amount}`));
  bus.emit('hit', { amount: 1 });
  off();
  bus.emit('hit', { amount: 2 });
  assert.deepEqual(got, ['a1', 'b1', 'a2']);
  assert.equal(bus.listenerCount('hit'), 1);
});

test('once fires a single time', () => {
  const bus = new EventBus<Events>();
  let n = 0;
  bus.once('done', () => n++);
  bus.emit('done', undefined);
  bus.emit('done', undefined);
  assert.equal(n, 1);
  assert.equal(bus.listenerCount('done'), 0);
});

test('a throwing listener is reported and the rest still run', () => {
  const errors: unknown[] = [];
  const bus = new EventBus<Events>((_, err) => errors.push(err));
  let after = false;
  bus.on('hit', () => {
    throw new Error('boom');
  });
  bus.on('hit', () => (after = true));
  bus.emit('hit', { amount: 0 });
  assert.equal(after, true);
  assert.equal(errors.length, 1);
});

test('a listener unsubscribing another mid-emit does not skip anyone this time round', () => {
  const bus = new EventBus<Events>();
  const got: string[] = [];
  let offB = () => {};
  bus.on('hit', () => {
    got.push('a');
    offB();
  });
  offB = bus.on('hit', () => got.push('b'));
  bus.emit('hit', { amount: 0 });
  bus.emit('hit', { amount: 0 });
  assert.deepEqual(got, ['a', 'b', 'a']);
});
