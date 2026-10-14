import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spatialMix } from './spatial.ts';

const me = { x: 100, y: 100 };

test('a source beside the listener is full and centred; one at the edge of range is gone', () => {
  const near = spatialMix(me, me);
  assert.deepEqual(near, { audible: true, gain: 1, pan: 0, cutoffHz: 18000 });
  const edge = spatialMix(me, { x: 100, y: 580 });
  assert.equal(edge.audible, false);
  assert.equal(edge.gain, 0);
  assert.equal(spatialMix(me, { x: 100, y: 579 }, { range: 480 }).audible, true);
});

test('loudness falls off by the rolloff, and the highs go with distance', () => {
  const half = spatialMix(me, { x: 100, y: 340 }, { range: 480 });
  assert.ok(Math.abs(half.gain - Math.pow(0.5, 1.5)) < 1e-12);
  assert.ok(Math.abs(spatialMix(me, { x: 100, y: 340 }, { range: 480, rolloff: 1 }).gain - 0.5) < 1e-12);
  assert.ok(Math.abs(half.cutoffHz - 18000 * Math.sqrt(0.1)) < 1e-6, 'half way, the geometric middle of the muffle');
  assert.equal(spatialMix(me, { x: 100, y: 340 }, { muffle: null }).cutoffHz, 20000);
  assert.equal(spatialMix(me, { x: 100, y: 340 }, { muffle: [8000, 800] }).cutoffHz, 8000 * Math.sqrt(0.1));
});

test('a source to one side pans that way, up to the limit, and not at all above or below', () => {
  assert.ok(spatialMix(me, { x: 40, y: 100 }).pan < 0);
  assert.ok(spatialMix(me, { x: 160, y: 100 }).pan > 0);
  assert.equal(spatialMix(me, { x: 100, y: 300 }).pan, 0);
  assert.equal(spatialMix(me, { x: 340, y: 100 }).pan, 0.8, 'past panWidth it holds at maxPan');
  assert.equal(spatialMix(me, { x: 160, y: 100 }, { panWidth: 60, maxPan: 1 }).pan, 1);
  assert.equal(spatialMix(me, { x: 130, y: 100 }, { panWidth: 60, maxPan: 1 }).pan, 0.5);
});
