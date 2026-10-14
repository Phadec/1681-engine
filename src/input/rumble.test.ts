import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Actions } from './Actions.ts';
import { rumble, rumbleParams, stopRumble, type RumblePad } from './rumble.ts';

function pad(result: unknown = 'complete') {
  const played: unknown[] = [];
  let resets = 0;
  const p: RumblePad & { buttons: []; axes: [] } = {
    buttons: [],
    axes: [],
    vibrationActuator: {
      playEffect: async (_type, params) => {
        played.push(params);
        if (result instanceof Error) throw result;
        return result;
      },
      reset: async () => void resets++,
    },
  };
  return { p, played, resets: () => resets };
}

test('rumble parameters are clamped to what the API takes', () => {
  assert.deepEqual(rumbleParams({ strong: 2, weak: -1, durationMs: 9000 }), { duration: 5000, startDelay: 0, strongMagnitude: 1, weakMagnitude: 0 });
  assert.deepEqual(rumbleParams({ weak: 0.5 }), { duration: 200, startDelay: 0, strongMagnitude: 0, weakMagnitude: 0.5 });
  assert.equal(rumbleParams({ strong: Number.NaN }).strongMagnitude, 0);
});

test('a pad with an actuator rumbles; one without, or a refusal, is a quiet false', async () => {
  const a = pad();
  assert.equal(await rumble(0, { strong: 0.8, durationMs: 120 }, () => [a.p]), true);
  assert.deepEqual(a.played, [{ duration: 120, startDelay: 0, strongMagnitude: 0.8, weakMagnitude: 0 }]);
  assert.equal(await rumble(1, { strong: 1 }, () => [a.p]), false);
  assert.equal(await rumble(0, { strong: 1 }, () => [{ vibrationActuator: null }]), false);
  assert.equal(await rumble(0, { strong: 1 }, () => [pad(new Error('busy')).p]), false);
  assert.equal(await rumble(0, {}, () => [a.p]), false, 'both motors at 0 plays nothing');
  await stopRumble(0, () => [a.p]);
  assert.equal(a.resets(), 1);
  await stopRumble(3, () => []);
});

test('actions rumble the pads they read', async () => {
  const a = pad();
  const b = pad('preempted');
  const input = new Actions(null, { jump: ['pad:a'] }, { gamepads: () => [a.p, null, b.p] });
  assert.equal(await input.rumble({ weak: 0.3 }), true);
  assert.equal(a.played.length + b.played.length, 2);
  assert.equal(await input.rumble({ weak: 0.3 }, 1), false);
});
