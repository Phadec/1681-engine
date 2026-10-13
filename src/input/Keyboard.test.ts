import assert from 'node:assert/strict';
import { test } from 'node:test';

// Keyboard listens for blur on `window`; under node an EventTarget stands in
const g = globalThis as unknown as { window?: EventTarget };
g.window ??= new EventTarget();
const { Keyboard } = await import('./Keyboard.ts');

function key(target: EventTarget, type: 'keydown' | 'keyup', code: string, repeat = false): void {
  const e = new Event(type) as Event & { code: string; repeat: boolean };
  e.code = code;
  e.repeat = repeat;
  target.dispatchEvent(e);
}

test('a tap shorter than a step is seen by exactly one step', () => {
  const target = new EventTarget();
  const kb = new Keyboard(target as unknown as HTMLElement);
  key(target, 'keydown', 'Space');
  key(target, 'keyup', 'Space');
  assert.equal(kb.pressed('Space'), true);
  assert.equal(kb.released('Space'), true);
  assert.equal(kb.isDown('Space'), false);
  kb.endStep();
  assert.equal(kb.pressed('Space'), false);
  kb.destroy();
});

test('auto-repeat is not a new press; axis reads both sides', () => {
  const target = new EventTarget();
  const kb = new Keyboard(target as unknown as HTMLElement);
  key(target, 'keydown', 'KeyD');
  kb.endStep();
  key(target, 'keydown', 'KeyD', true);
  assert.equal(kb.pressed('KeyD'), false);
  assert.equal(kb.axis(['KeyA'], ['KeyD']), 1);
  key(target, 'keydown', 'KeyA');
  assert.equal(kb.axis(['KeyA'], ['KeyD']), 0);
  kb.destroy();
});

test('losing focus lets every held key go', () => {
  const target = new EventTarget();
  const kb = new Keyboard(target as unknown as HTMLElement);
  key(target, 'keydown', 'KeyW');
  kb.endStep();
  g.window!.dispatchEvent(new Event('blur'));
  assert.equal(kb.isDown('KeyW'), false);
  assert.equal(kb.released('KeyW'), true);
  kb.destroy();
});
