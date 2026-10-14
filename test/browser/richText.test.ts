import type { Application } from 'pixi.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { TextureRegistry } from '../../src/core/TextureRegistry';
import { RichText } from '../../src/ui/rich/RichText';
import { BitmapRichFont, CanvasRichFont } from '../../src/ui/rich/richFonts';
import type { RichTextItem } from '../../src/ui/rich/richLayout';
import { canvasOf, destroyApp, makeApp, renderAndRead } from './gl';

let app: Application;
beforeEach(async () => {
  app = await makeApp(240, 120);
});
afterEach(() => destroyApp(app));

const FONT = { fontFamily: 'monospace', fontSize: 16 };
const textItems = (t: RichText) => t.layout.lines.flatMap((l) => l.items.filter((i): i is RichTextItem => i.kind === 'text'));

test('runs are measured by the browser’s own canvas text metrics', () => {
  const text = new RichText('Hello [b]bold[/b] [color=#ff0000]world[/color]', { font: new CanvasRichFont(FONT) });
  const ctx = document.createElement('canvas').getContext('2d')!;
  for (const item of textItems(text)) {
    ctx.font = `${item.style.bold ? 'bold ' : ''}16px monospace`;
    expect(item.width).toBeCloseTo(ctx.measureText(item.text).width, 0);
    expect(item.width).toBeGreaterThan(0);
  }
  expect(text.layout.lines).toHaveLength(1);
  expect(text.layout.lines[0]!.height).toBeGreaterThan(10);
});

test('wraps at real word widths and never lets a line run past the width', () => {
  const words = 'alpha beta gamma delta epsilon zeta eta theta';
  const text = new RichText(words, { font: new CanvasRichFont(FONT), wrapWidth: 100 });
  const lines = text.layout.lines;
  expect(lines.length).toBeGreaterThan(2);
  for (const l of lines) expect(l.width).toBeLessThanOrEqual(100);
  const joined = lines.map((l) => l.items.map((i) => (i.kind === 'text' ? i.text : '')).join('').trim()).join(' ');
  expect(joined.replace(/\s+/g, ' ')).toBe(words);
  for (let i = 1; i < lines.length; i++) expect(lines[i]!.y).toBeGreaterThanOrEqual(lines[i - 1]!.y + lines[i - 1]!.height);
});

test('a coloured run is drawn in its colour, inside its own box only', () => {
  const text = new RichText('plain [color=#ff0000]red[/color] plain', { font: new CanvasRichFont({ ...FONT, color: '#00ff00' }) });
  text.position.set(10, 10);
  app.stage.addChild(text);
  const f = renderAndRead(app);
  const red = textItems(text).find((i) => i.text === 'red')!;
  const isRed = (c: number[]) => c[0]! > 150 && c[1]! < 80;
  const isGreen = (c: number[]) => c[1]! > 150 && c[0]! < 80;
  const x0 = 10 + Math.floor(red.x);
  const x1 = 10 + Math.ceil(red.x + red.width);
  const y0 = 10 + Math.floor(red.y);
  const y1 = 10 + Math.ceil(red.y + red.height);
  expect(f.count(isRed, x0, y0, x1, y1)).toBeGreaterThan(5);
  expect(f.count(isRed)).toBe(f.count(isRed, x0, y0, x1, y1));
  expect(f.count(isGreen, x0, y0, x1, y1)).toBe(0);
  expect(f.count(isGreen)).toBeGreaterThan(10);
  // nothing is drawn outside the box the layout reports
  const box = (c: number[]) => c[0]! + c[1]! + c[2]! > 0;
  expect(f.count(box)).toBe(f.count(box, 10, 10, 10 + Math.ceil(text.layout.width) + 1, 10 + Math.ceil(text.layout.height) + 1));
});

test('an inline icon takes a whole multiple of its frame and is drawn where the layout put it', () => {
  const textures = new TextureRegistry();
  textures.addCanvas('coin', canvasOf(4, 4, (c) => {
    c.fillStyle = '#ffff00';
    c.fillRect(0, 0, 4, 4);
  }));
  const text = new RichText('pay [icon=coin]50', { font: new CanvasRichFont(FONT), textures, pixelPerfect: true });
  app.stage.addChild(text);
  const icon = text.layout.lines[0]!.items.find((i) => i.kind === 'icon')!;
  expect(icon.width % 4).toBe(0);
  expect(icon.height).toBe(icon.width);
  expect(icon.height).toBeLessThanOrEqual(text.layout.lines[0]!.height);
  expect(Number.isInteger(icon.x) && Number.isInteger(icon.y)).toBe(true);
  const f = renderAndRead(app);
  const yellow = (c: number[]) => c[0]! === 255 && c[1]! === 255 && c[2]! === 0;
  expect(f.count(yellow)).toBe(icon.width * icon.height);
  expect(f.at(icon.x, icon.y)).toEqual([255, 255, 0, 255]);
});

test('a bitmap font lays out and draws within its reported box', () => {
  const text = new RichText('[color=#ff0000]bitmap[/color] text', { font: new BitmapRichFont({ ...FONT, color: '#ffffff' }) });
  app.stage.addChild(text);
  expect(text.layout.width).toBeGreaterThan(30);
  const f = renderAndRead(app);
  const lit = (c: number[]) => c[0]! + c[1]! + c[2]! > 0;
  expect(f.count(lit)).toBeGreaterThan(20);
  expect(f.count(lit)).toBe(f.count(lit, 0, 0, Math.ceil(text.layout.width) + 1, Math.ceil(text.layout.height) + 1));
  const red = textItems(text)[0]!;
  expect(f.count((c) => c[0] > 150 && c[1] < 80, 0, 0, Math.ceil(red.x + red.width) + 1, 120)).toBeGreaterThan(5);
});
