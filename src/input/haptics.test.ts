import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HapticGate, Haptics } from './haptics';

type Kind = 'crit' | 'hurt' | 'press';

test('one buzz per kind per its gap, kinds apart', () => {
  const gate = new HapticGate<Kind>({ crit: 120, hurt: 300 });
  assert.ok(gate.allow('crit', 0));
  assert.ok(!gate.allow('crit', 119));
  assert.ok(gate.allow('hurt', 50));
  assert.ok(gate.allow('crit', 120));
  assert.ok(!gate.allow('hurt', 349));
  assert.ok(gate.allow('press', 0) && gate.allow('press', 0));
  gate.reset();
  assert.ok(gate.allow('hurt', 351));
});

test('haptics ask the setting first, swallow a failing player and count only what went', async () => {
  let t = 0;
  let on = false;
  const played: Kind[] = [];
  const h = new Haptics<Kind>({
    gaps: { crit: 100 },
    enabled: () => on,
    now: () => t,
    play: (k) => {
      played.push(k);
      return Promise.reject(new Error('no plugin'));
    },
  });
  assert.equal(h.buzz('crit'), false);
  on = true;
  assert.equal(h.buzz('crit'), true);
  t = 50;
  assert.equal(h.buzz('crit'), false);
  t = 100;
  assert.equal(h.buzz('crit'), true);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(played, ['crit', 'crit']);
  // the default player is a no-op without the Vibration API
  assert.equal(new Haptics<Kind>().buzz('press'), true);
});
