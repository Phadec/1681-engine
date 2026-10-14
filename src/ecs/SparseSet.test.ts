import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SparseSet } from './SparseSet.ts';

/** Entity ids here are slot + 1000 × generation; the set is indexed by slot. */
const slotOf = (e: number) => e % 1000;

test('set, get and has by slot; setting again replaces the value without counting a join', () => {
  const s = new SparseSet<string>();
  s.set(3, 3, 'a');
  assert.equal(s.version, 1);
  assert.equal(s.has(3), true);
  assert.equal(s.has(4), false);
  assert.equal(s.get(3), 'a');
  s.set(3, 1003, 'b');
  assert.equal(s.get(3), 'b');
  assert.deepEqual(s.entities, [1003]);
  assert.equal(s.size, 1);
  assert.equal(s.version, 1, 'a changed value is not a membership change');
});

test('slots past the sparse array read as absent and grow it on set', () => {
  const s = new SparseSet<number>();
  assert.equal(s.get(10_000), undefined);
  assert.equal(s.has(10_000), false);
  assert.equal(s.delete(10_000, slotOf), false);
  s.set(10_000, 10_000, 7);
  assert.equal(s.get(10_000), 7);
  assert.equal(s.get(5), undefined);
});

test('delete swaps the last entry into the hole and keeps every lookup right', () => {
  const s = new SparseSet<string>();
  for (const [slot, v] of [[1, 'a'], [2, 'b'], [3, 'c'], [4, 'd']] as const) s.set(slot, slot, v);
  assert.equal(s.delete(2, slotOf), true);
  assert.deepEqual(s.entities, [1, 4, 3]);
  assert.deepEqual(s.values, ['a', 'd', 'c']);
  assert.equal(s.get(4), 'd');
  assert.equal(s.get(2), undefined);
  assert.equal(s.delete(2, slotOf), false);
  // removing the last one needs no swap
  assert.equal(s.delete(3, slotOf), true);
  assert.deepEqual(s.values, ['a', 'd']);
});

test('the version moves on every join, leave and clear', () => {
  const s = new SparseSet<number>();
  s.set(0, 0, 1);
  s.set(1, 1, 1);
  s.delete(0, slotOf);
  assert.equal(s.version, 3);
  s.clear();
  assert.equal(s.version, 4);
  assert.equal(s.size, 0);
  assert.equal(s.has(1), false);
});

test('a thousand random joins and leaves match a map', () => {
  const s = new SparseSet<number>();
  const model = new Map<number, number>();
  let seed = 7;
  const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  for (let i = 0; i < 1000; i++) {
    const slot = rand(200);
    if (rand(3) === 0) {
      assert.equal(s.delete(slot, slotOf), model.delete(slot));
    } else {
      s.set(slot, slot, i);
      model.set(slot, i);
    }
  }
  assert.equal(s.size, model.size);
  for (const [slot, v] of model) assert.equal(s.get(slot), v);
  s.entities.forEach((e, d) => assert.equal(s.values[d], model.get(e)));
});
