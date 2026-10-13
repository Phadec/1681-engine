import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fadeValue } from './MusicPlayer.ts';

test('a fade runs linearly from its start to its end, then holds', () => {
  const f = { from: 1, to: 0, start: 1000, ms: 400 };
  assert.equal(fadeValue(f, 900), 1);
  assert.equal(fadeValue(f, 1200), 0.5);
  assert.equal(fadeValue(f, 1400), 0);
  assert.equal(fadeValue(f, 5000), 0);
});

test('a fade of no length is already at its end', () => {
  assert.equal(fadeValue({ from: 0, to: 1, start: 0, ms: 0 }, 0), 1);
});
