import assert from 'node:assert/strict';
import { test } from 'node:test';

const g = globalThis as unknown as { window?: EventTarget };
g.window ??= new EventTarget();
const { Keyboard } = await import('./Keyboard.ts');
const { Actions, PAD_BUTTONS } = await import('./Actions.ts');
type PadState = import('./Actions.ts').PadState;

function key(target: EventTarget, type: 'keydown' | 'keyup', code: string): void {
  const e = new Event(type) as Event & { code: string; repeat: boolean };
  e.code = code;
  e.repeat = false;
  target.dispatchEvent(e);
}

function pad(buttons: Partial<Record<(typeof PAD_BUTTONS)[number], number>> = {}, axes: number[] = [0, 0, 0, 0]): PadState {
  return { buttons: PAD_BUTTONS.map((b) => ({ pressed: (buttons[b] ?? 0) > 0, value: buttons[b] ?? 0 })), axes };
}

const bindings = {
  left: ['KeyA', 'pad:left', 'pad:lx-'],
  right: ['KeyD', 'pad:right', 'pad:lx+'],
  up: ['KeyW', 'pad:ly-'],
  down: ['KeyS', 'pad:ly+'],
  jump: ['Space', 'pad:a', 'touch:jump'],
  fire: ['pad:rt'],
};

test('a key drives its action; pressed and released are edges between steps', () => {
  const target = new EventTarget();
  const kb = new Keyboard(target as unknown as HTMLElement);
  const input = new Actions(kb, bindings, { gamepads: () => [] });
  key(target, 'keydown', 'Space');
  input.poll();
  assert.equal(input.pressed('jump'), true);
  input.endStep();
  input.poll();
  assert.equal(input.down('jump'), true);
  assert.equal(input.pressed('jump'), false);
  input.endStep();
  key(target, 'keyup', 'Space');
  input.poll();
  assert.equal(input.released('jump'), true);
  kb.destroy();
});

test('a gamepad stick past its dead zone is an analog value, and a diagonal is never longer than 1', () => {
  let state = pad({}, [0.1, 0, 0, 0]);
  const input = new Actions(null, bindings, { gamepads: () => [state] });
  input.poll();
  assert.equal(input.down('right'), false, 'inside the dead zone');
  state = pad({}, [1, 1, 0, 0]);
  input.poll();
  const [x, y] = input.vector('left', 'right', 'up', 'down');
  assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-9);
  state = pad({}, [-0.625, 0, 0, 0]);
  input.poll();
  assert.ok(Math.abs(input.value('left') - 0.5) < 1e-9, 'rescaled from the dead zone to the edge');
});

test('buttons: a digital press is 1, a trigger its depth', () => {
  let state = pad({ a: 1, rt: 0.3 });
  const input = new Actions(null, bindings, { gamepads: () => [state, null] });
  input.poll();
  assert.equal(input.value('jump'), 1);
  assert.equal(input.value('fire'), 0.3);
  state = pad({ rt: 0.8 });
  input.poll();
  assert.equal(input.value('fire'), 0.8);
});

test('a virtual button tapped between two steps is still seen by one', () => {
  const input = new Actions(null, bindings, { gamepads: () => [] });
  input.press('jump');
  input.release('jump');
  input.poll();
  assert.equal(input.pressed('jump'), true);
  input.endStep();
  input.poll();
  assert.equal(input.down('jump'), false);
});

test('an action can be rebound', () => {
  const target = new EventTarget();
  const kb = new Keyboard(target as unknown as HTMLElement);
  const input = new Actions(kb, bindings, { gamepads: () => [] });
  input.bind('jump', ['KeyJ']);
  key(target, 'keydown', 'Space');
  input.poll();
  assert.equal(input.down('jump'), false);
  key(target, 'keydown', 'KeyJ');
  input.poll();
  assert.equal(input.down('jump'), true);
  assert.deepEqual(input.bindingsOf('jump'), ['KeyJ']);
  kb.destroy();
});

test('flush forgets presses made while nobody read the input; a held key stays held but is not pressed', () => {
  const target = new EventTarget();
  const kb = new Keyboard(target as unknown as HTMLElement);
  const input = new Actions(kb, bindings, { gamepads: () => [] });
  input.poll();
  input.endStep();
  // a pause menu over the scene: these presses were its own
  key(target, 'keydown', 'Space');
  key(target, 'keydown', 'KeyA');
  key(target, 'keyup', 'KeyA');
  input.press('jump');
  input.flush();
  input.poll();
  assert.equal(input.pressed('jump'), false, 'no stale press');
  assert.equal(input.down('jump'), true, 'still held');
  assert.equal(input.pressed('left'), false);
  assert.equal(input.released('left'), false);
  input.endStep();
  key(target, 'keyup', 'Space');
  input.release('jump');
  input.poll();
  assert.equal(input.released('jump'), true, 'letting go afterwards is an edge again');
});

test('a chord binding needs its modifier, and wins over the bare key until that key comes up', () => {
  const target = new EventTarget();
  const kb = new Keyboard(target as unknown as HTMLElement);
  const input = new Actions(kb, { next: ['Tab'], prev: ['Shift+Tab'], run: ['ShiftLeft'] }, { gamepads: () => [] });
  key(target, 'keydown', 'Tab');
  input.poll();
  assert.equal(input.pressed('next'), true);
  assert.equal(input.down('prev'), false);
  input.endStep();
  key(target, 'keyup', 'Tab');
  input.poll();
  input.endStep();
  key(target, 'keydown', 'ShiftRight');
  key(target, 'keydown', 'Tab');
  input.poll();
  assert.equal(input.pressed('prev'), true);
  assert.equal(input.down('next'), false, 'the chord holds Tab');
  input.endStep();
  key(target, 'keyup', 'ShiftRight');
  input.poll();
  assert.equal(input.down('prev'), false);
  assert.equal(input.pressed('next'), false, 'letting Shift go first does not make it a Tab');
  input.endStep();
  key(target, 'keyup', 'Tab');
  input.poll();
  input.endStep();
  key(target, 'keydown', 'ShiftLeft');
  key(target, 'keydown', 'Tab');
  input.poll();
  assert.equal(input.down('run'), true, 'the modifier itself is still a key');
  assert.equal(input.down('prev'), true);
});
