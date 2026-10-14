import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ParticleSim } from './ParticleSim.ts';
import { ParticleBudget } from './ParticleBudget.ts';
import { engineSettings } from '../settings.ts';

test('particles move, fall and die after their life, packed without holes', () => {
  const sim = new ParticleSim(4);
  sim.spawn(0, 0, 10, 0, 1, 0, 0, 0);
  sim.spawn(0, 0, 0, 0, 0.25, 0, 0, 0);
  sim.spawn(5, 5, 0, 0, 2, 0, 1, 0);
  let died = 0;
  for (let i = 0; i < 10; i++) died += sim.step(0.05, 0, 100, 0);
  assert.equal(died, 1);
  assert.equal(sim.count, 2);
  // the long-lived one moved into the dead one's place
  assert.ok(sim.life.subarray(0, 2).includes(2));
  const first = [...sim.life.subarray(0, 2)].indexOf(1);
  assert.ok(Math.abs(sim.x[first]! - 5) < 1e-4);
  assert.ok(sim.y[first]! > 0, 'gravity pulled it down');
  assert.equal(sim.spawn(0, 0, 0, 0, 1, 0, 0, 0), 2);
  sim.spawn(0, 0, 0, 0, 1, 0, 0, 0);
  assert.equal(sim.spawn(0, 0, 0, 0, 1, 0, 0, 0), -1, 'full');
});

test('drag is the same at any step size', () => {
  const a = new ParticleSim(1);
  const b = new ParticleSim(1);
  a.spawn(0, 0, 100, 0, 10, 0, 0, 0);
  b.spawn(0, 0, 100, 0, 10, 0, 0, 0);
  for (let i = 0; i < 60; i++) a.step(1 / 60, 0, 0, 2);
  for (let i = 0; i < 144; i++) b.step(1 / 144, 0, 0, 2);
  assert.ok(Math.abs(a.vx[0]! - b.vx[0]!) < 0.01);
  assert.ok(Math.abs(a.vx[0]! - 100 * Math.exp(-2)) < 0.05);
});

test('the budget is shared and shrinks under reduced effects', () => {
  const budget = new ParticleBudget(100, 0.5);
  assert.equal(budget.take(70), 70);
  assert.equal(budget.take(70), 30);
  assert.equal(budget.take(1), 0);
  budget.give(60);
  assert.equal(budget.live, 40);
  engineSettings.set({ reducedFx: true });
  try {
    assert.equal(budget.effectiveLimit, 50);
    assert.equal(budget.take(20), 10);
  } finally {
    engineSettings.reset();
  }
});
