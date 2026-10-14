import { Sprite, Texture } from 'pixi.js';
import { afterEach, expect, test } from 'vitest';
import { DrawCallCounter } from '../../src/debug/DrawCallCounter';
import { Engine } from '../../src/engine/Engine';
import { glOf, renderAndRead } from './gl';

let engine: Engine | null = null;
afterEach(async () => {
  await engine?.destroy();
  engine = null;
});

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

test('Engine.create gives a WebGL canvas that draws its background', async () => {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  engine = await Engine.create({ parent, width: 32, height: 24, background: '#ff0000', pixelPerfect: true });
  expect(parent.querySelector('canvas')).toBe(engine.app.canvas);
  expect(engine.app.canvas.width).toBe(32);
  expect(engine.app.canvas.height).toBe(24);
  glOf(engine.app);
  const frame = renderAndRead(engine.app);
  expect(frame.at(0, 0)).toEqual([255, 0, 0, 255]);
  expect(frame.at(31, 23)).toEqual([255, 0, 0, 255]);
});

test('DrawCallCounter counts the draws of a real render, and nothing once uninstalled', async () => {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  engine = await Engine.create({ parent, width: 16, height: 16 });
  const sprite = new Sprite(Texture.WHITE);
  sprite.setSize(8, 8);
  engine.app.stage.addChild(sprite);
  const counter = new DrawCallCounter(engine.app.renderer);
  expect(counter.supported).toBe(true);
  counter.install();
  counter.take();
  engine.app.renderer.render(engine.app.stage);
  expect(counter.take()).toBeGreaterThan(0);
  counter.uninstall();
  engine.app.renderer.render(engine.app.stage);
  expect(counter.take()).toBe(0);
});

test('pauseWhenHidden stops the ticker while the document is hidden and resumes it when shown', async () => {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  engine = await Engine.create({ parent, width: 16, height: 16, pauseWhenHidden: true });
  let frames = 0;
  engine.events.on('frame', () => frames++);
  for (let i = 0; i < 4; i++) await nextFrame();
  expect(frames).toBeGreaterThan(0);
  expect(engine.paused).toBe(false);

  // headless Chromium keeps its page visible: the real document's visibility is overridden and the real event fired
  const visibility = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')!;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  try {
    document.dispatchEvent(new Event('visibilitychange'));
    expect(engine.paused).toBe(true);
    expect(engine.app.ticker.started).toBe(false);
    const before = frames;
    for (let i = 0; i < 4; i++) await nextFrame();
    expect(frames).toBe(before);
  } finally {
    delete (document as unknown as Record<string, unknown>).visibilityState;
    Object.defineProperty(Document.prototype, 'visibilityState', visibility);
  }
  document.dispatchEvent(new Event('visibilitychange'));
  expect(engine.paused).toBe(false);
  expect(engine.app.ticker.started).toBe(true);
  const before = frames;
  for (let i = 0; i < 4; i++) await nextFrame();
  expect(frames).toBeGreaterThan(before);

  // a pause the game made itself survives the tab coming back
  engine.pause();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  delete (document as unknown as Record<string, unknown>).visibilityState;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(engine.paused).toBe(true);
});

test('destroy removes the canvas', async () => {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const e = await Engine.create({ parent, width: 8, height: 8 });
  await e.destroy();
  expect(parent.querySelector('canvas')).toBe(null);
});
