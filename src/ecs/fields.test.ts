import assert from 'node:assert/strict';
import { test } from 'node:test';
import { growColumns, isFields } from './fields.ts';
import { defineComponent, defineFields } from './World.ts';

test('growColumns makes one typed array per field, of the field\'s kind', () => {
  const cols = growColumns({ x: 'f32', hp: 'i32', flags: 'u8', id: 'u32', exact: 'f64' }, 8);
  assert.ok(cols.x instanceof Float32Array);
  assert.ok(cols.hp instanceof Int32Array);
  assert.ok(cols.flags instanceof Uint8Array);
  assert.ok(cols.id instanceof Uint32Array);
  assert.ok(cols.exact instanceof Float64Array);
  assert.equal(cols.x!.length, 8);
});

test('growing keeps what the old columns held and zeroes the rest', () => {
  const spec = { x: 'f32', n: 'i16' } as const;
  const old = growColumns(spec, 2);
  (old.x as Float32Array)[1] = 2.5;
  (old.n as Int16Array)[0] = -3;
  const next = growColumns(spec, 6, old);
  assert.deepEqual([...(next.x as Float32Array)], [0, 2.5, 0, 0, 0, 0]);
  assert.deepEqual([...(next.n as Int16Array)], [-3, 0, 0, 0, 0, 0]);
  assert.notEqual(next.x, old.x, 'a new array: callers fetch columns again after a grow');
});

test('a field column wraps like its typed array', () => {
  const cols = growColumns({ b: 'u8', s: 'i8' }, 1);
  (cols.b as Uint8Array)[0] = 300;
  (cols.s as Int8Array)[0] = 200;
  assert.equal(cols.b![0], 44);
  assert.equal(cols.s![0], -56);
});

test('isFields tells field components from object ones', () => {
  assert.equal(isFields(defineFields('P', { x: 'f32' })), true);
  assert.equal(isFields(defineComponent<{ x: number }>('Q')), false);
});
