import type { Container, Text } from 'pixi.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { DebugOverlay } from '../../src/debug/DebugOverlay';
import { World, defineComponent } from '../../src/ecs/World';
import { Engine } from '../../src/engine/Engine';

let engine: Engine;
let overlay: DebugOverlay | null = null;
let keys: HTMLElement;
beforeEach(async () => {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  keys = document.createElement('div');
  document.body.appendChild(keys);
  engine = await Engine.create({ parent, width: 320, height: 180 });
});
afterEach(async () => {
  overlay?.destroy();
  overlay = null;
  await engine.destroy();
  keys.remove();
});

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
async function frames(n: number) {
  for (let i = 0; i < n; i++) await nextFrame();
}

function press(code: string, repeat = false): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { code, repeat, cancelable: true });
  keys.dispatchEvent(e);
  return e;
}

const textOf = (o: DebugOverlay) => (o as unknown as { text: Text }).text.text;
const panelOf = (o: DebugOverlay) => (o as unknown as { panel: Container }).panel;

test('its key shows and hides it, and the key does not reach the browser; a held key does not flicker it', () => {
  overlay = new DebugOverlay(engine, { target: keys });
  expect(overlay.visible).toBe(false);
  const e = press('Backquote');
  expect(e.defaultPrevented).toBe(true);
  expect(overlay.visible).toBe(true);
  expect(panelOf(overlay).parent).toBe(engine.stage.screen);
  press('Backquote', true);
  expect(overlay.visible).toBe(true);
  const other = press('KeyA');
  expect(other.defaultPrevented).toBe(false);
  expect(overlay.visible).toBe(true);
  press('Backquote');
  expect(overlay.visible).toBe(false);
  expect(panelOf(overlay).parent).toBeNull();
});

test('a key of its own is honoured; destroyed, it stops listening', () => {
  overlay = new DebugOverlay(engine, { target: keys, key: 'F3' });
  press('Backquote');
  expect(overlay.visible).toBe(false);
  press('F3');
  expect(overlay.visible).toBe(true);
  overlay.destroy();
  expect(overlay.visible).toBe(false);
  expect(press('F3').defaultPrevented).toBe(false);
  overlay = null;
});

test('shown, it reports frames, draw calls, the world and its entities', async () => {
  const world = new World();
  const Name = defineComponent<string>('Name');
  world.spawn([Name, 'crate']);
  world.spawn([Name, 'barrel']);
  overlay = new DebugOverlay(engine, { target: keys, world: () => world, components: [Name] });
  overlay.show();
  await frames(4);
  const text = textOf(overlay);
  expect(text).toMatch(/^\d+ fps {2}avg [\d.]+ ms {2}max [\d.]+ ms/);
  expect(text).toMatch(/draw calls \d+ {2}textures \d+/);
  expect(text).toContain('entities 2');
  expect(text).toContain('Name crate');
  expect(text).toContain('Name barrel');
});

test('the inspector is capped at its limit', async () => {
  const world = new World();
  const Name = defineComponent<string>('Name');
  for (let i = 0; i < 20; i++) world.spawn([Name, `e${i}`]);
  overlay = new DebugOverlay(engine, { target: keys, world: () => world, inspectLimit: 3 });
  overlay.show();
  await frames(3);
  expect(textOf(overlay).split('\n').filter((l) => l.startsWith('#')).length).toBe(3);
});

test('errors from before it was opened are listed, a repeat counted once', async () => {
  overlay = new DebugOverlay(engine, { target: keys, world: () => undefined });
  engine.events.emit('error', { where: 'update', error: new Error('boom') });
  engine.events.emit('error', { where: 'update', error: new Error('boom') });
  engine.events.emit('error', { where: 'camera', error: 'lost' });
  expect(overlay.errors.entries.map((e) => e.count)).toEqual([2, 1]);
  overlay.show();
  await frames(3);
  const text = textOf(overlay);
  expect(text).toContain('entities -');
  expect(text).toContain('errors:\n2x update: boom\ncamera: lost');
});

test('colliders are drawn only while it is shown', async () => {
  let calls = 0;
  overlay = new DebugOverlay(engine, {
    target: keys,
    colliders: (box, line) => {
      calls++;
      box(10, 10, 20, 20);
      line(0, 0, 40, 40, 0xff0000);
    },
  });
  await frames(3);
  expect(calls).toBe(0);
  overlay.show();
  await frames(3);
  expect(calls).toBeGreaterThan(0);
  overlay.hide();
  const before = calls;
  await frames(3);
  expect(calls).toBe(before);
});

test('the panel grows to fit its text', async () => {
  const world = new World();
  const Name = defineComponent<string>('Name');
  world.spawn([Name, 'x'.repeat(60)]);
  overlay = new DebugOverlay(engine, { target: keys, world: () => world });
  overlay.show();
  await frames(3);
  const back = panelOf(overlay).children[0]!;
  expect(back.width).toBeGreaterThan(192);
  expect(back.height).toBeGreaterThan(40);
});
