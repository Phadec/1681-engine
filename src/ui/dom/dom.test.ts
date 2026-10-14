import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStore } from './createStore';
import { isEditable, isInside, shouldShield } from './shieldDecision';
import { onScreen, worldToScreen } from './worldToScreen';

test('the store merges patches and tells its listeners with the state before', () => {
  const store = createStore({ hp: 10, name: 'a' });
  const seen: [number, number][] = [];
  const off = store.subscribe((s, prev) => seen.push([s.hp, prev.hp]));
  store.setState({ hp: 7 });
  store.setState((s) => ({ hp: s.hp - 2 }));
  assert.deepEqual(seen, [[7, 10], [5, 7]]);
  assert.equal(store.getState().name, 'a');
  off();
  store.setState({ hp: 1 });
  assert.equal(seen.length, 2);
});

test('a patch that changes nothing notifies nobody and keeps the same state object', () => {
  const store = createStore({ hp: 10 });
  const before = store.getState();
  let calls = 0;
  store.subscribe(() => calls++);
  store.setState({ hp: 10 });
  assert.equal(calls, 0);
  assert.equal(store.getState(), before);
});

test('select fires only when its slice changes; reset goes back to the start', () => {
  const store = createStore({ hp: 10, mp: 5 });
  const hp: number[] = [];
  store.select((s) => s.hp, (v) => hp.push(v));
  store.setState({ mp: 1 });
  store.setState({ hp: 3 });
  store.reset();
  assert.deepEqual(hp, [3, 10]);
  assert.equal(store.getState().mp, 5);
});

test('a listener that unsubscribes while notified does not skip the next one', () => {
  const store = createStore({ n: 0 });
  const order: string[] = [];
  const offA = store.subscribe(() => {
    order.push('a');
    offA();
  });
  store.subscribe(() => order.push('b'));
  store.setState({ n: 1 });
  store.setState({ n: 2 });
  assert.deepEqual(order, ['a', 'b', 'b']);
});

test('worldToScreen goes through the layer transform and the CSS stretch', () => {
  const layer = { x: -100, y: -50, scale: { x: 2, y: 2 } };
  const out = { x: 0, y: 0 };
  assert.deepEqual(worldToScreen(layer, 60, 40, out), { x: 20, y: 30 });
  assert.deepEqual(worldToScreen(layer, 60, 40, out, 1.5), { x: 30, y: 45 });
  assert.ok(onScreen(-10, 50, 100, 100, 16));
  assert.ok(!onScreen(-20, 50, 100, 100, 16));
  assert.ok(!onScreen(50, 130, 100, 100, 16));
});

test('typing fields are editable; buttons, checkboxes and sliders are not', () => {
  assert.ok(isEditable({ tagName: 'INPUT', type: 'text' }));
  assert.ok(isEditable({ tagName: 'input', type: '' }));
  assert.ok(isEditable({ tagName: 'TEXTAREA' }));
  assert.ok(isEditable({ tagName: 'DIV', isContentEditable: true }));
  assert.ok(!isEditable({ tagName: 'INPUT', type: 'checkbox' }));
  assert.ok(!isEditable({ tagName: 'INPUT', type: 'range' }));
  assert.ok(!isEditable({ tagName: 'BUTTON' }));
  assert.ok(!isEditable(null));
});

test('isInside walks the parents up to the root', () => {
  const root = { tagName: 'DIV' };
  const panel = { tagName: 'DIV', parentElement: root };
  const field = { tagName: 'INPUT', parentElement: panel };
  assert.ok(isInside(field, root));
  assert.ok(isInside(root, root));
  assert.ok(!isInside({ tagName: 'CANVAS', parentElement: null }, root));
});

test('the shield keeps typing and presses in the UI and lets releases and moves through', () => {
  const field = { insideUi: true, editable: true, code: 'KeyW' };
  const button = { insideUi: true, editable: false, code: 'KeyW' };
  assert.ok(shouldShield('keydown', field), 'typing W in a field does not walk');
  assert.ok(!shouldShield('keydown', button), 'a button left focused does not stop the walk');
  assert.ok(shouldShield('keydown', { ...button, code: 'Space' }), 'Space presses the button, not jump');
  assert.ok(!shouldShield('keyup', field), 'releases always reach the engine');
  assert.ok(shouldShield('pointerdown', button));
  assert.ok(shouldShield('wheel', button));
  assert.ok(!shouldShield('pointermove', button), 'aim follows the pointer over a panel');
  assert.ok(!shouldShield('pointerup', button));
  assert.ok(!shouldShield('keydown', { insideUi: false, editable: true, code: 'KeyW' }), 'outside the UI, nothing');
  assert.ok(shouldShield('keydown', { ...button, code: 'KeyE' }, { uiKeys: ['KeyE'] }));
});
