import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntityUpdate } from './constants.ts';
import {
  SNAP_FRAME_TAG,
  decodeSnapshotFrame,
  decodeUpdates,
  encodeSnapshotFrame,
  encodeUpdates,
  quantizeUpdates,
} from './snapshotCodec.ts';

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');

// The bytes a server in any language must write: change them only with a protocol version bump.
const PLAIN: EntityUpdate = [1, 1.5, -2.25, Math.PI / 2, 3, 70000, 0x1ff];
const PLAIN_BYTES = '00 00 00 01 00 0c ff ee 40 03 00 01 11 70 01 ff';
// every field past its range: clamped, wrapped, never an exception
const EDGE: EntityUpdate = [-1, 5000, -5000, -Math.PI, 300, -5, 70000];
const EDGE_BYTES = 'ff ff ff ff 7f ff 80 00 80 ff ff ff ff fb ff ff';

test('one record is the golden 16 bytes', () => {
  assert.equal(hex(encodeUpdates([PLAIN])), PLAIN_BYTES);
  assert.equal(hex(encodeUpdates([EDGE])), EDGE_BYTES);
});

test('records read back quantised, and as quantizeUpdates predicts', () => {
  const back = decodeUpdates(encodeUpdates([PLAIN, EDGE]));
  assert.deepEqual(back, [
    [1, 1.5, -2.25, Math.PI / 2, 3, 70000, 0x1ff],
    [-1, 4095.875, -4096, -Math.PI, 255, -5, 0xffff],
  ]);
  assert.deepEqual(quantizeUpdates([PLAIN, EDGE]), back);
});

test('non-finite numbers go on the wire as their limits or zero', () => {
  const [u] = decodeUpdates(encodeUpdates([[Number.NaN, Infinity, -Infinity, Number.NaN, -1, Infinity, Number.NaN]]));
  assert.deepEqual(u, [0, 4095.875, -4096, 0, 0, 0x7fffffff, 0]);
});

test('a snapshot frame is the tag, the JSON length, the JSON, then the records', () => {
  const frame = encodeSnapshotFrame({ t: 'snap', tick: 7, up: [PLAIN] });
  const json = '{"t":"snap","tick":7}';
  assert.equal(hex(frame.subarray(0, 5)), `0${SNAP_FRAME_TAG} 00 00 00 15`);
  assert.equal(new TextDecoder().decode(frame.subarray(5, 5 + json.length)), json);
  assert.equal(hex(frame.subarray(5 + json.length)), PLAIN_BYTES);
  assert.deepEqual(decodeSnapshotFrame(frame), { t: 'snap', tick: 7, up: [PLAIN] });
  // an ArrayBuffer (what a WebSocket hands over) reads the same as a view into a bigger buffer
  const padded = new Uint8Array(frame.length + 3);
  padded.set(frame, 3);
  assert.deepEqual(decodeSnapshotFrame(padded.subarray(3)), decodeSnapshotFrame(frame.slice().buffer));
});

test('a frame with no updates has no up field', () => {
  const back = decodeSnapshotFrame<{ t: string; up?: EntityUpdate[] }>(encodeSnapshotFrame({ t: 'snap', up: [] }));
  assert.deepEqual(back, { t: 'snap' });
});

test('broken frames are refused', () => {
  assert.throws(() => decodeSnapshotFrame(new Uint8Array([1, 0])), /short/);
  assert.throws(() => decodeSnapshotFrame(new Uint8Array([9, 0, 0, 0, 0])), /tag 9/);
  assert.throws(() => decodeSnapshotFrame(new Uint8Array([1, 0, 0, 0, 9, 0x7b])), /overruns/);
  assert.throws(() => decodeUpdates(new Uint8Array(15)), /15 bytes/);
});
