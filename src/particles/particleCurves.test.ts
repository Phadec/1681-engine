import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerpColor, sampleColor, sampleCurve } from './particleCurves.ts';

test('a number is constant, start/end is a line clamped to 0–1', () => {
  assert.equal(sampleCurve(3, 0.7), 3);
  assert.equal(sampleCurve({ start: 1, end: 0 }, 0.25), 0.75);
  assert.equal(sampleCurve({ start: 1, end: 0 }, 2), 0);
  assert.equal(sampleCurve({ start: 1, end: 0 }, -1), 1);
});

test('keyframes interpolate between neighbours and hold at the ends', () => {
  const swell: [number, number][] = [
    [0.2, 0],
    [0.4, 2],
    [1, 1],
  ];
  assert.equal(sampleCurve(swell, 0), 0);
  assert.ok(Math.abs(sampleCurve(swell, 0.3) - 1) < 1e-9);
  assert.ok(Math.abs(sampleCurve(swell, 0.7) - 1.5) < 1e-9);
  assert.equal(sampleCurve(swell, 1.5), 1);
  assert.equal(sampleCurve([], 0.5), 0);
});

test('colours blend per channel', () => {
  assert.equal(lerpColor(0x000000, 0xff8040, 0.5), 0x804020);
  assert.equal(sampleColor({ start: 0xff0000, end: 0x0000ff }, 1), 0x0000ff);
  assert.equal(sampleColor([[0, 0xffffff], [1, 0x000000]], 0.5), 0x808080);
  assert.equal(sampleColor(0x123456, 0.9), 0x123456);
});
