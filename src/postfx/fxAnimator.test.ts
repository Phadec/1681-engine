import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FxAnimator } from './fxAnimator.ts';

test('an animation runs from its start to its end and calls done once', () => {
  const fx = new FxAnimator();
  const seen: number[] = [];
  let done = 0;
  fx.run({ from: 1, to: 0, ms: 100, set: (v) => seen.push(v), done: () => done++ });
  assert.equal(seen[0], 1);
  fx.step(50);
  assert.ok(Math.abs(seen.at(-1)! - 0.5) < 1e-9);
  fx.step(80);
  assert.equal(seen.at(-1), 0);
  assert.equal(done, 1);
  assert.equal(fx.size, 0);
});

test('a keyed animation replaces the running one with that key', () => {
  const fx = new FxAnimator();
  let v = 0;
  let firstDone = false;
  fx.run({ key: 'flash', from: 1, to: 0, ms: 200, set: (x) => (v = x), done: () => (firstDone = true) });
  fx.step(100);
  fx.run({ key: 'flash', from: 0.8, to: 0, ms: 200, set: (x) => (v = x) });
  assert.ok(firstDone);
  assert.equal(fx.size, 1);
  assert.equal(v, 0.8);
});

test('zero length sets the end at once, and finishAll ends everything', () => {
  const fx = new FxAnimator();
  let a = 0;
  let b = 0;
  fx.run({ from: 0, to: 5, ms: 0, set: (x) => (a = x) });
  assert.equal(a, 5);
  fx.run({ from: 0, to: 3, ms: 1000, set: (x) => (b = x) });
  fx.finishAll();
  assert.equal(b, 3);
  assert.equal(fx.size, 0);
});
