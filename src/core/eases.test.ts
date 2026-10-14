import assert from 'node:assert/strict';
import { test } from 'node:test';
import { easeByName } from './eases.ts';

const NAMES = ['Linear', 'Quad.In', 'Quad.Out', 'Cubic.Out', 'Sine.In', 'Sine.InOut', 'Back.Out'];
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('every ease starts at 0 and ends at 1', () => {
  for (const n of NAMES) {
    const f = easeByName(n);
    assert.ok(close(f(0), 0), `${n}(0)`);
    assert.ok(close(f(1), 1), `${n}(1)`);
  }
});

test('ins start slow, outs start fast, Back.Out overshoots', () => {
  assert.ok(easeByName('Quad.In')(0.5) < 0.5);
  assert.ok(easeByName('Sine.In')(0.5) < 0.5);
  assert.ok(easeByName('Quad.Out')(0.5) > 0.5);
  assert.ok(easeByName('Cubic.Out')(0.5) > easeByName('Quad.Out')(0.5));
  assert.ok(close(easeByName('Sine.InOut')(0.5), 0.5));
  let peak = 0;
  for (let t = 0; t <= 1; t += 0.01) peak = Math.max(peak, easeByName('Back.Out')(t));
  assert.ok(peak > 1.05);
});

test('no name is Quad.Out; an unknown name warns and is linear', () => {
  assert.equal(easeByName(undefined), easeByName('Quad.Out'));
  const warn = console.warn;
  const said: unknown[] = [];
  console.warn = (...a: unknown[]) => void said.push(a);
  try {
    assert.equal(easeByName('Elastic.Wobble')(0.3), 0.3);
  } finally {
    console.warn = warn;
  }
  assert.equal(said.length, 1);
});
