import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PadState } from './Actions.ts';
import { deviceOf, InputCapture, padLabel } from './InputCapture.ts';
import { Keymap } from './Keymap.ts';

/** A pad whose buttons and axes a test sets. */
function pad(): PadState & { press(i: number, v?: number): void; tilt(i: number, v: number): void } {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const axes = [0, 0, 0, 0];
  return {
    buttons,
    axes,
    press(i: number, v = 1) {
      buttons[i] = { pressed: v > 0.5, value: v };
    },
    tilt(i: number, v: number) {
      axes[i] = v;
    },
  } as never;
}

function keydown(code: string, repeat = false): KeyboardEvent {
  return Object.assign(new Event('keydown', { cancelable: true }), { code, repeat }) as unknown as KeyboardEvent;
}

test('the next key pressed is the binding; Escape cancels; a held repeat is ignored', async () => {
  const target = new EventTarget();
  const c = new InputCapture({ target, gamepads: () => [] });
  const later: string[] = [];
  target.addEventListener('keydown', (e) => later.push((e as KeyboardEvent).code));
  target.dispatchEvent(keydown('KeyQ', true));
  assert.equal(c.open, true);
  const e = keydown('KeyJ');
  target.dispatchEvent(e);
  assert.equal(await c.result, 'KeyJ');
  assert.equal(e.defaultPrevented, true);
  assert.deepEqual(later, ['KeyQ'], 'the bound key never reached the game');
  target.dispatchEvent(keydown('KeyK'));
  assert.deepEqual(later, ['KeyQ', 'KeyK'], 'and the capture stopped listening');
  const esc = new InputCapture({ target, gamepads: () => [] });
  target.dispatchEvent(keydown('Escape'));
  assert.equal(await esc.result, null);
  const cancelled = new InputCapture({ target, gamepads: () => [] });
  cancelled.cancel();
  assert.equal(await cancelled.result, null);
});

test('a pad button or a stick pushed far enough binds; what was held when it began must be let go first', async () => {
  const p = pad();
  p.press(0); // the A that opened the menu
  const c = new InputCapture({ target: new EventTarget(), gamepads: () => [null, p] });
  c.poll();
  assert.equal(c.open, true, 'A is still the press that opened it');
  p.tilt(0, -0.3);
  c.poll();
  assert.equal(c.open, true, 'a stick barely pushed is drift');
  p.press(0, 0);
  c.poll();
  p.press(0); // pressed anew: now it counts
  c.poll();
  assert.equal(await c.result, 'pad:a');
  const s = new InputCapture({ target: new EventTarget(), gamepads: () => [p] });
  p.press(0, 0);
  p.tilt(1, -0.9);
  s.poll();
  assert.equal(await s.result, 'pad:ly-');
  const t = pad();
  const trig = new InputCapture({ target: new EventTarget(), gamepads: () => [t] });
  t.press(7, 0.8);
  trig.poll();
  assert.equal(await trig.result, 'pad:rt');
});

test('a capture limited to one device ignores the other', async () => {
  const target = new EventTarget();
  const p = pad();
  const keysOnly = new InputCapture({ target, gamepads: () => [p], devices: ['keys'] });
  p.press(1);
  keysOnly.poll();
  assert.equal(keysOnly.open, true);
  keysOnly.cancel();
  const padOnly = new InputCapture({ target, gamepads: () => [p], devices: ['pad'] });
  target.dispatchEvent(keydown('KeyJ'));
  assert.equal(padOnly.open, true);
  p.press(2);
  padOnly.poll();
  assert.equal(await padOnly.result, 'pad:x');
});

test('pad bindings read as names, and each device keeps its own first binding in a keymap', () => {
  assert.equal(padLabel('pad:a'), 'A');
  assert.equal(padLabel('pad:lx-'), 'Left stick left');
  assert.equal(padLabel('pad:a', { a: 'Cross' }), 'Cross');
  assert.equal(padLabel('KeyW'), 'KeyW');
  assert.deepEqual(['KeyW', 'pad:a', 'touch:jump'].map(deviceOf), ['keys', 'pad', 'touch']);

  const keys = new Keymap({ jump: ['Space', 'pad:a'], attack: ['KeyJ', 'pad:x'] });
  keys.bind('jump', 'pad:b');
  assert.deepEqual(keys.keysFor('jump'), ['pad:b', 'Space'], 'the pad binding was replaced, the key kept');
  assert.deepEqual(keys.keysFor('jump', 'keys'), ['Space']);
  assert.deepEqual(keys.keysFor('jump', 'pad'), ['pad:b']);
  const lost = keys.bind('jump', 'pad:x');
  assert.deepEqual(lost, ['attack'], 'one input, one action, pads included');
  assert.deepEqual(keys.keysFor('attack'), ['KeyJ']);
  keys.bind('jump', 'KeyK');
  assert.deepEqual(keys.keysFor('jump'), ['KeyK', 'pad:x']);
});
