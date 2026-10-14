import { Container, Ticker } from 'pixi.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { DomOverlay } from '../../src/ui/dom/DomOverlay';
import { DomWorldAnchors } from '../../src/ui/dom/DomWorldAnchors';
import { InputShield } from '../../src/ui/dom/InputShield';

let host: HTMLDivElement;
let canvas: HTMLCanvasElement;
let overlay: DomOverlay | null = null;
beforeEach(() => {
  host = document.createElement('div');
  Object.assign(host.style, { position: 'relative', margin: '0', padding: '13px 0 0 7px' });
  canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  Object.assign(canvas.style, { display: 'block', width: '320px', height: '180px', border: '2px solid red' });
  host.appendChild(canvas);
  document.body.appendChild(host);
});
afterEach(() => {
  overlay?.destroy();
  overlay = null;
  host.remove();
});

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const box = (el: Element) => el.getBoundingClientRect();

test('the overlay lies exactly over the canvas, inside its border, beside it in the same parent', () => {
  overlay = new DomOverlay(canvas, { className: 'ui', zIndex: 5 });
  expect(overlay.root.previousElementSibling).toBe(canvas);
  expect(overlay.root.className).toBe('ui');
  expect(overlay.root.style.zIndex).toBe('5');
  const c = box(canvas);
  const o = box(overlay.root);
  // the canvas's content box: its border is not under the UI
  expect(o.left).toBe(c.left + 2);
  expect(o.top).toBe(c.top + 2);
  expect(o.width).toBe(320);
  expect(o.height).toBe(180);
  expect([overlay.width, overlay.height]).toEqual([320, 180]);
  expect(overlay.cssScale).toBe(1);
});

test('presses pass through the overlay to the canvas, except on what is made interactive', () => {
  overlay = new DomOverlay(canvas);
  const button = DomOverlay.interactive(document.createElement('button'));
  Object.assign(button.style, { position: 'absolute', left: '10px', top: '10px', width: '40px', height: '20px' });
  overlay.content.appendChild(button);
  const c = box(canvas);
  expect(document.elementFromPoint(c.left + 100, c.top + 100)).toBe(canvas);
  expect(document.elementFromPoint(c.left + 2 + 20, c.top + 2 + 15)).toBe(button);
});

test('a canvas resized by CSS takes the overlay with it, and logicalSize gives the stretch', async () => {
  overlay = new DomOverlay(canvas, { logicalSize: () => ({ width: 160, height: 90 }) });
  expect(overlay.cssScale).toBe(2);
  canvas.style.width = '480px';
  canvas.style.height = '270px';
  // the ResizeObserver tells it a frame or two later, with no window resize at all
  for (let i = 0; i < 3; i++) await nextFrame();
  expect(box(overlay.root).width).toBe(480);
  expect(overlay.cssScale).toBe(3);
});

test('content is laid out at 1 / scale and scaled back up, publishing --ui-scale', () => {
  overlay = new DomOverlay(canvas);
  overlay.setScale(4);
  expect(overlay.scale).toBe(4);
  expect(overlay.content.style.width).toBe('80px');
  expect(overlay.content.style.height).toBe('45px');
  expect(overlay.content.style.transform).toBe('scale(4)');
  expect(overlay.root.style.getPropertyValue('--ui-scale')).toBe('4');
  const panel = document.createElement('div');
  Object.assign(panel.style, { position: 'absolute', left: '0', top: '0', width: '80px', height: '45px' });
  overlay.content.appendChild(panel);
  expect(box(panel).width).toBe(320);
  overlay.setScale(0);
  overlay.setScale(-1);
  // a nonsense scale is ignored
  expect(overlay.scale).toBe(4);
  overlay.setScale(1);
  expect(overlay.content.style.transform).toBe('');
});

test('destroyed, the overlay leaves the page', () => {
  overlay = new DomOverlay(canvas);
  const root = overlay.root;
  overlay.destroy();
  expect(root.isConnected).toBe(false);
  overlay = null;
});

test('the shield keeps typing and UI presses from the window, and lets releases and game keys through', () => {
  overlay = new DomOverlay(canvas);
  const field = DomOverlay.interactive(document.createElement('input'));
  const button = DomOverlay.interactive(document.createElement('button'));
  overlay.content.append(field, button);
  const shield = new InputShield(overlay.root);
  const heard: string[] = [];
  const listen = (e: Event) => heard.push(`${e.type}:${(e as KeyboardEvent).code ?? ''}`);
  for (const t of ['keydown', 'keyup', 'pointerdown', 'wheel']) window.addEventListener(t, listen);
  try {
    const key = (el: Element, type: string, code: string) => el.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    key(field, 'keydown', 'KeyW');
    key(field, 'keyup', 'KeyW');
    key(button, 'keydown', 'Enter');
    key(button, 'keydown', 'KeyW');
    key(canvas, 'keydown', 'KeyA');
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    button.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    expect(heard).toEqual(['keyup:KeyW', 'keydown:KeyW', 'keydown:KeyA']);
    field.focus();
    expect(shield.typing).toBe(true);
    button.focus();
    expect(shield.typing).toBe(false);
    shield.destroy();
    key(field, 'keydown', 'KeyQ');
    expect(heard.at(-1)).toBe('keydown:KeyQ');
  } finally {
    for (const t of ['keydown', 'keyup', 'pointerdown', 'wheel']) window.removeEventListener(t, listen);
  }
});

test('the shield takes its own list of keys a button keeps', () => {
  overlay = new DomOverlay(canvas);
  const button = DomOverlay.interactive(document.createElement('button'));
  overlay.content.append(button);
  const shield = new InputShield(overlay.root, { uiKeys: ['KeyE'] });
  const heard: string[] = [];
  const listen = (e: KeyboardEvent) => heard.push(e.code);
  window.addEventListener('keydown', listen);
  try {
    for (const code of ['KeyE', 'Enter']) button.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    expect(heard).toEqual(['Enter']);
  } finally {
    window.removeEventListener('keydown', listen);
    shield.destroy();
  }
});

test('anchored elements follow world points through the layer transform, on whole pixels, hidden off screen', () => {
  overlay = new DomOverlay(canvas);
  const world = new Container();
  world.scale.set(2);
  world.position.set(-20, -10);
  world.updateLocalTransform();
  const anchors = new DomWorldAnchors(overlay, world);
  const name = document.createElement('span');
  name.textContent = 'hero';
  const hero = { x: 40.3, y: 30 };
  const remove = anchors.add(name, hero, { offsetY: -4 });
  expect(name.parentElement).toBe(overlay.content);
  anchors.update();
  // (40.3 × 2 − 20, 30 × 2 − 10 − 4) rounded
  expect(name.style.transform).toBe('translate3d(61px, 46px, 0px) translate(-50%, -100%)');
  hero.x = 1000;
  anchors.update();
  expect(name.style.display).toBe('none');
  hero.x = 40;
  anchors.update();
  expect(name.style.display).toBe('');
  expect(name.style.transform).toBe('translate3d(60px, 46px, 0px) translate(-50%, -100%)');
  remove();
  hero.x = 50;
  anchors.update();
  expect(name.style.transform).toContain('60px');
  anchors.destroy();
});

test('a still anchor writes no style; a scaled overlay places in its own units; a ticker drives it until detached', () => {
  overlay = new DomOverlay(canvas, { logicalSize: () => ({ width: 160, height: 90 }) });
  overlay.setScale(2);
  const world = new Container();
  const anchors = new DomWorldAnchors(overlay, world);
  const tag = document.createElement('i');
  const p = { x: 10, y: 10 };
  anchors.add(tag, p, { alignX: 0, alignY: 0 });
  anchors.update();
  // 10 world px → 10 screen px → ×2 CSS stretch → ÷2 UI scale = 10 content px; no align translate
  expect(tag.style.transform).toBe('translate3d(10px, 10px, 0px)');
  let writes = 0;
  new MutationObserver((m) => (writes += m.length)).observe(tag, { attributes: true });
  const ticker = new Ticker();
  ticker.autoStart = false;
  const stop = anchors.attach(ticker);
  ticker.update(performance.now() + 16);
  ticker.update(performance.now() + 32);
  return Promise.resolve().then(() => {
    expect(writes).toBe(0);
    p.x = 20;
    ticker.update(performance.now() + 48);
    expect(tag.style.transform).toBe('translate3d(20px, 10px, 0px)');
    stop();
    p.x = 30;
    ticker.update(performance.now() + 64);
    expect(tag.style.transform).toBe('translate3d(20px, 10px, 0px)');
    anchors.destroy();
    ticker.destroy();
  });
});
