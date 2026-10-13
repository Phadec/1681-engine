import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FixedLoop } from './FixedLoop.ts';

test('frames of any length add up to the same steps', () => {
  const a = new FixedLoop({ hz: 60 });
  const b = new FixedLoop({ hz: 60 });
  let stepsA = 0;
  let stepsB = 0;
  for (let i = 0; i < 60; i++) a.advance(1000 / 60, () => stepsA++);
  for (let i = 0; i < 144; i++) b.advance(1000 / 144, () => stepsB++);
  assert.equal(stepsA, 60);
  assert.ok(Math.abs(stepsB - 60) <= 1, `144 Hz frames took ${stepsB} steps in a second`);
});

test('the leftover share of a step is returned for interpolation', () => {
  const loop = new FixedLoop({ hz: 10 });
  const alpha = loop.advance(150, () => {});
  assert.ok(Math.abs(alpha - 0.5) < 1e-9);
});

test('a very late frame runs at most maxStepsPerFrame and drops the rest of its debt', () => {
  const loop = new FixedLoop({ hz: 60, maxStepsPerFrame: 5 });
  let steps = 0;
  loop.advance(10_000, () => steps++);
  assert.equal(steps, 5);
  steps = 0;
  loop.advance(1000 / 60, () => steps++);
  assert.equal(steps, 1, 'the dropped debt is not paid later');
});

test('ticks count up across frames; nonsense deltas add nothing', () => {
  const loop = new FixedLoop({ hz: 100 });
  const ticks: number[] = [];
  loop.advance(25, (t) => ticks.push(t));
  loop.advance(Number.NaN, (t) => ticks.push(t));
  loop.advance(-50, (t) => ticks.push(t));
  loop.advance(10, (t) => ticks.push(t));
  assert.deepEqual(ticks, [0, 1, 2]);
});

test('a non-positive rate is refused', () => {
  assert.throws(() => new FixedLoop({ hz: 0 }));
});
