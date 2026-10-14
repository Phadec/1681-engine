import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dueParticles, sampleRange, scaleCount, seededRandom, spreadAngle } from './particleSampling.ts';

test('ranges and spreads map a draw onto their span', () => {
  assert.equal(sampleRange(5, 0.9), 5);
  assert.equal(sampleRange([10, 20], 0.5), 15);
  assert.equal(spreadAngle(1, 0.5, 0), 0.5);
  assert.equal(spreadAngle(1, 0.5, 0.5), 1);
});

test('a slow rate at a high frame rate still emits, carrying the fraction', () => {
  let carry = 0;
  let total = 0;
  for (let f = 0; f < 144; f++) {
    const due = dueParticles(30, 1 / 144, carry);
    const n = Math.floor(due);
    carry = due - n;
    total += n;
  }
  assert.ok(total === 29 || total === 30, `got ${total}`);
});

test('scaled counts keep their expected value', () => {
  const r = seededRandom(7);
  let sum = 0;
  for (let i = 0; i < 10000; i++) sum += scaleCount(3, 0.35, r());
  assert.ok(Math.abs(sum / 10000 - 1.05) < 0.05);
  assert.equal(scaleCount(9, 1, 0.99), 9);
});

test('the seeded generator repeats and stays in [0, 1)', () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});
