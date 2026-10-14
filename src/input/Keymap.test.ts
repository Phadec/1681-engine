import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Actions } from './Actions';
import { Keymap, keyLabel, mergeKeymap } from './Keymap';

const DEFAULTS = { up: ['KeyW', 'ArrowUp'], jump: ['Space'], map: ['KeyM'], menu: ['Escape', 'KeyP'] };

test('reserved keys are never bound, not even by default', () => {
  const k = new Keymap(DEFAULTS);
  assert.deepEqual(k.keysFor('menu'), ['KeyP']);
  assert.equal(k.bind('jump', 'Tab'), null);
  assert.deepEqual(k.keysFor('jump'), ['Space']);
});

test('binding a key takes it off whatever held it and keeps the alternates', () => {
  const k = new Keymap(DEFAULTS);
  let changes = 0;
  k.onChange(() => changes++);
  assert.deepEqual(k.bind('map', 'KeyW'), ['up']);
  assert.deepEqual(k.keysFor('up'), ['ArrowUp']);
  assert.deepEqual(k.keysFor('map'), ['KeyW']);
  assert.equal(k.actionFor('KeyW'), 'map');
  k.bind('up', 'KeyU');
  assert.deepEqual(k.keysFor('up'), ['KeyU']);
  assert.equal(changes, 2);
  k.reset();
  assert.deepEqual(k.keysFor('up'), ['KeyW', 'ArrowUp']);
});

test('a saved set: unknown actions dropped, new actions keep only free defaults, one key one action', () => {
  const merged = mergeKeymap(DEFAULTS, { up: ['KeyM'], jump: 'nonsense', gone: ['KeyQ'], map: ['KeyJ'] });
  assert.deepEqual(merged.up, ['KeyM']);
  assert.deepEqual(merged.jump, ['Space']);
  assert.deepEqual(merged.map, ['KeyJ']);
  assert.ok(!('gone' in merged));
  // a new action whose default a saved one took loses that key
  const fresh = mergeKeymap({ ...DEFAULTS, dash: ['KeyM', 'ShiftLeft'] }, { up: ['KeyM'] });
  assert.deepEqual(fresh.dash, ['ShiftLeft']);
  // a hand-edited save binding one key twice: the first action keeps it
  const twice = mergeKeymap(DEFAULTS, { up: ['KeyZ'], jump: ['KeyZ'] });
  assert.deepEqual(twice.up, ['KeyZ']);
  assert.deepEqual(twice.jump, []);
  const k = new Keymap(DEFAULTS);
  k.load({ jump: ['KeyJ'] });
  assert.deepEqual(new Keymap(DEFAULTS).toJSON().jump, ['Space']);
  assert.deepEqual(k.toJSON().jump, ['KeyJ']);
  k.load(null);
  assert.deepEqual(k.toJSON().jump, ['Space']);
});

test('the keymap feeds an Actions, with extra inputs it does not own', () => {
  const k = new Keymap(DEFAULTS);
  const actions = new Actions(null, { up: [], jump: [], map: [], menu: [] }, { gamepads: () => [] });
  k.applyTo(actions, { jump: ['pad:a'] });
  assert.deepEqual(actions.bindingsOf('jump'), ['Space', 'pad:a']);
  assert.deepEqual(actions.bindingsOf('up'), ['KeyW', 'ArrowUp']);
});

test('key labels', () => {
  assert.equal(keyLabel('KeyW'), 'W');
  assert.equal(keyLabel('Digit1'), '1');
  assert.equal(keyLabel('Numpad3'), 'Num 3');
  assert.equal(keyLabel('BracketLeft'), '[');
  assert.equal(keyLabel('ArrowUp', { ArrowUp: '↑' }), '↑');
  assert.equal(keyLabel('F5'), 'F5');
});

test('applyTo binds only the keymap\'s actions on an Actions that has more, with fixed inputs after the player\'s', () => {
  const k = new Keymap({ jump: ['Space'], pause: ['KeyP', 'Escape'] }, undefined, { jump: ['pad:a'], pause: ['Escape', 'pad:start'] });
  assert.deepEqual(k.keysFor('pause'), ['KeyP'], 'Escape stays reserved for the player');
  assert.deepEqual(k.fixedFor('pause'), ['Escape', 'pad:start']);
  const actions = new Actions(null, { jump: [], pause: [], ui_accept: ['Enter'] }, { gamepads: () => [] });
  k.applyTo(actions);
  assert.deepEqual(actions.bindingsOf('pause'), ['KeyP', 'Escape', 'pad:start']);
  assert.deepEqual(actions.bindingsOf('jump'), ['Space', 'pad:a']);
  assert.deepEqual(actions.bindingsOf('ui_accept'), ['Enter'], 'an action the keymap does not own is left alone');
  assert.deepEqual(Object.keys(k.toJSON()), ['jump', 'pause'], 'fixed inputs are never saved');
  assert.deepEqual(k.toJSON().pause, ['KeyP']);
});

test('a chord reads as its parts', () => {
  assert.equal(keyLabel('Shift+Tab'), 'Shift+Tab');
  assert.equal(keyLabel('Ctrl+KeyS', { Ctrl: 'Strg' }), 'Strg+S');
});
