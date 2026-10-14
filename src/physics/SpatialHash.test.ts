import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Body } from './Body.ts';
import { SpatialHash } from './SpatialHash.ts';

/** Only the bounds are read. */
const box = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY }) as unknown as Body;

test('a body is listed in every cell its bounds touch, margin included', () => {
  const h = new SpatialHash(16);
  const b = box(10, 10, 40, 20);
  h.insert(b);
  for (const cx of [0, 1, 2]) for (const cy of [0, 1]) assert.deepEqual(h.at(cx, cy), [b]);
  assert.equal(h.at(3, 0), undefined);
  const m = box(0, 0, 1, 1);
  h.insert(m, 2);
  assert.deepEqual(h.at(-1, -1), [m]);
});

test('negative coordinates hash to their own cells', () => {
  const h = new SpatialHash(10);
  assert.equal(h.cellOf(-0.5), -1);
  assert.notEqual(SpatialHash.key(-1, 0), SpatialHash.key(0, 0));
  assert.notEqual(SpatialHash.key(0, -1), SpatialHash.key(-1, 0));
  // keys wrap every 65,536 cells: a shared list, never a missed pair
  assert.equal(SpatialHash.key(0, 0), SpatialHash.key(65536, 0));
});

test('clear empties every cell and reuses the lists', () => {
  const h = new SpatialHash(16);
  h.insert(box(0, 0, 4, 4));
  const list = h.at(0, 0);
  h.clear();
  assert.equal(h.at(0, 0), undefined);
  h.insert(box(100, 100, 104, 104));
  assert.equal(h.at(6, 6), list, 'the emptied list is handed out again');
});

test('a cell size that is not positive is refused', () => {
  assert.throws(() => new SpatialHash(0), /positive/);
  assert.throws(() => new SpatialHash(Number.NaN), /positive/);
});
