import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntityUpdate } from './constants.ts';
import {
  SNAP_FRAME_HEADER_BYTES,
  UPDATE_RECORD_BYTES,
  decodeSnapshotFrame,
  decodeUpdates,
  dequantizeAim,
  encodeSnapshotFrame,
  encodeUpdates,
  quantizeAim,
  quantizePos,
  quantizeUpdates,
} from './snapshotCodec.ts';

test('one record is 16 big-endian bytes in the documented layout', () => {
  const bytes = encodeUpdates([[258, 1.5, -2, Math.PI / 2, 3, 70000, 0x1234]]);
  assert.equal(bytes.length, UPDATE_RECORD_BYTES);
  // a server in another language writes exactly these
  assert.deepEqual([...bytes], [0, 0, 1, 2, 0, 12, 0xff, 0xf0, 64, 3, 0, 1, 0x11, 0x70, 0x12, 0x34]);
});

test('positions go to 1/8 px and clamp at the i16 range; aims wrap into [-π, π)', () => {
  assert.equal(quantizePos(1.06), 8);
  assert.equal(quantizePos(5000), 32767);
  assert.equal(quantizePos(-5000), -32768);
  assert.equal(quantizePos(Number.NaN), 0);
  assert.equal(quantizePos(Number.POSITIVE_INFINITY), 32767);
  assert.equal(quantizeAim(-Math.PI / 2), 192);
  assert.equal(quantizeAim(Math.PI * 2 + 0.01), quantizeAim(0.01));
  assert.equal(dequantizeAim(128), -Math.PI);
  assert.equal(quantizeAim(Number.NaN), 0);
});

test('a round trip loses at most the documented error', () => {
  const ups: EntityUpdate[] = [];
  for (let i = 0; i < 200; i++) ups.push([i, (i * 37.13) % 4000, -((i * 11.7) % 4000), ((i * 0.37) % 6) - 3, i % 256, i * 1000, i % 512]);
  const back = decodeUpdates(encodeUpdates(ups));
  back.forEach((u, i) => {
    const o = ups[i]!;
    assert.equal(u[0], o[0]);
    assert.ok(Math.abs(u[1] - o[1]) <= 1 / 16 + 1e-9);
    assert.ok(Math.abs(u[2] - o[2]) <= 1 / 16 + 1e-9);
    const da = Math.abs(((u[3] - o[3] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    assert.ok(da <= Math.PI / 256 + 1e-9);
    assert.deepEqual([u[4], u[5], u[6]], [o[4], o[5], o[6]]);
  });
});

test('quantizeUpdates gives exactly what a decode of the bytes gives', () => {
  const ups: EntityUpdate[] = [
    [1, -0.01, 0.03, -0.001, 0, 0, 0],
    [2, 9999, -9999, 7, 300, -5, 70000],
    [3, 12.3456, 7.8, Math.PI, 2, 100, 3],
  ];
  assert.deepEqual(quantizeUpdates(ups), decodeUpdates(encodeUpdates(ups)));
  assert.ok(Object.is(quantizeUpdates([[0, -0.01, 0, 0, 0, 0, 0]])[0]![1], 0), 'no -0');
});

test('a frame carries the JSON without `up`, then the records, and reads back whole', () => {
  const snap = { t: 42, ev: [{ k: 'hit' }], up: [[7, 10, 20, 0, 1, 50, 0]] as EntityUpdate[] };
  const frame = encodeSnapshotFrame(snap);
  const jsonLen = new DataView(frame.buffer).getUint32(1);
  assert.equal(frame[0], 1);
  assert.equal(frame.length, SNAP_FRAME_HEADER_BYTES + jsonLen + UPDATE_RECORD_BYTES);
  assert.deepEqual(decodeSnapshotFrame(frame), snap);
  assert.deepEqual(decodeSnapshotFrame(frame.buffer as ArrayBuffer), snap);
  const none = decodeSnapshotFrame(encodeSnapshotFrame<{ t: number; up?: EntityUpdate[] }>({ t: 1 }));
  assert.deepEqual(none, { t: 1 });
});

test('broken frames are refused with a reason', () => {
  assert.throws(() => decodeSnapshotFrame(new Uint8Array([1, 0])), /short/);
  assert.throws(() => decodeSnapshotFrame(new Uint8Array([9, 0, 0, 0, 0])), /tag 9/);
  assert.throws(() => decodeSnapshotFrame(new Uint8Array([1, 0, 0, 0, 50, 0x7b])), /overruns/);
  assert.throws(() => decodeUpdates(new Uint8Array(17)), /17 bytes/);
});
