import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Footsteps } from './Footsteps.ts';

test('a point takes the surface the game names, the fallback where it names none', () => {
  const steps = new Footsteps({ sounds: { grass: { step: 'step_grass' }, stone: { step: 'step_stone', hoof: 'hoof_stone' } }, fallback: 'grass' });
  assert.equal(steps.surface(0, 0), 'grass');
  steps.setSurfaceAt((x) => (x > 100 ? 'stone' : undefined));
  assert.equal(steps.surface(50, 0), 'grass');
  assert.equal(steps.surface(150, 0), 'stone');
  // no audio context under node: a step is a no-op, never a throw
  steps.step(150, 0, true, true);
});
