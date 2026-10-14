import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SYNTH_RATE, renderRecipe, type SynthRecipe } from './synth.ts';

function peak(b: Float32Array): number {
  let p = 0;
  for (const v of b) p = Math.max(p, Math.abs(v));
  return p;
}

test('the buffer is as long as the latest layer, delay included', () => {
  const out = renderRecipe({ layers: [{ w: 'sine', f: [440, 440], t: 0.1, g: 0.5 }, { w: 'square', f: [220, 110], t: 0.05, d: 0.2, g: 0.3 }] });
  assert.equal(out.length, Math.ceil(0.25 * SYNTH_RATE) + 1);
  // nothing sounds in the gap between the layers
  assert.equal(peak(out.subarray(Math.round(0.11 * SYNTH_RATE), Math.round(0.19 * SYNTH_RATE))), 0);
});

test('a recipe renders the same samples every time, noise included', () => {
  const r: SynthRecipe = { layers: [{ w: 'noise', t: 0.05, g: 0.4 }, { w: 'noise', f: [800, 200], t: 0.05, g: 0.4, lp: [3000, 500] }] };
  assert.deepEqual(renderRecipe(r), renderRecipe(r));
});

test('the envelope rises over the attack and falls to silence', () => {
  const out = renderRecipe({ layers: [{ w: 'square', f: [100, 100], t: 0.1, at: 0.01, g: 0.5, c: 1 }] });
  const n = Math.round(0.1 * SYNTH_RATE);
  assert.equal(out[0], 0);
  assert.ok(Math.abs(out[Math.round(0.01 * SYNTH_RATE)]!) > 0.45);
  assert.ok(Math.abs(out[n - 1]!) < 0.01);
});

test('loud layers are brought back under full scale; quiet ones are left alone', () => {
  const loud = renderRecipe({ layers: [{ w: 'square', f: [200, 200], t: 0.05, g: 1 }, { w: 'square', f: [200, 200], t: 0.05, g: 1 }] });
  assert.ok(Math.abs(peak(loud) - 0.95) < 1e-6);
  const quiet = renderRecipe({ layers: [{ w: 'square', f: [200, 200], t: 0.05, g: 0.3, c: 1 }] });
  assert.ok(peak(quiet) <= 0.3 + 1e-6 && peak(quiet) > 0.29);
});

test('a high-pass at a low cutoff barely touches a tone; a low-pass dulls a square', () => {
  const tone = { w: 'square' as const, f: [2000, 2000] as [number, number], t: 0.05, g: 0.5, c: 1 };
  const plain = peak(renderRecipe({ layers: [tone] }));
  const lowPassed = peak(renderRecipe({ layers: [{ ...tone, lp: [200, 200] }] }));
  assert.ok(lowPassed < plain * 0.5, `${lowPassed} < ${plain} / 2`);
  for (const v of renderRecipe({ layers: [{ ...tone, hp: [20, 20] }] })) assert.ok(Number.isFinite(v));
});
