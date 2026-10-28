import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bucket, stickyBucket } from './lightBucket.ts';

test('buckets are every second pixel to 24, every eighth past it', () => {
  assert.equal(bucket(1), 2);
  assert.equal(bucket(23), 24);
  assert.equal(bucket(27), 24);
  assert.equal(bucket(29), 32);
});

test('a radius wavering on the line between two buckets keeps the one it had', () => {
  let b = stickyBucket(0, 27.9);
  assert.equal(b, 24);
  for (const r of [28.1, 27.9, 28.2, 27.8, 28.3]) {
    b = stickyBucket(b, r);
    assert.equal(b, 24);
  }
});

test('a radius growing at dusk takes each bucket once, never back', () => {
  let b = 0;
  const seen: number[] = [];
  for (let r = 10; r <= 60; r += 0.25) {
    b = stickyBucket(b, r + Math.sin(r * 7) * 0.4);
    if (seen.at(-1) !== b) seen.push(b);
  }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i]! > seen[i - 1]!, `went back from ${seen[i - 1]} to ${seen[i]}`);
});
