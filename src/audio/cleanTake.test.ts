import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanSamples } from './cleanTake';

test('a silent take is dropped', () => {
  assert.equal(cleanSamples([new Float32Array(1000)], 48000), null);
});

test('stereo is folded to mono, the leading silence cut and the level brought up', () => {
  const n = 4800;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 2400; i < n; i++) left[i] = right[i] = 0.02 * Math.sin(i / 5);
  const out = cleanSamples([left, right], 48000)!;
  assert.ok(out.length < n - 2000, 'leading silence trimmed');
  assert.ok(out.length > 2000, 'the sound kept');
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(peak > 0.1 && peak <= 0.95, `normalised peak ${peak}`);
});
