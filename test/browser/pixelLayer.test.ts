import type { Application } from 'pixi.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { PixelLayer, addPixelLayer } from '../../src/pixel/PixelLayer';
import { destroyApp, makeApp, renderAndRead, rgb, TestStage } from './gl';

let app: Application;
let stage: TestStage;
beforeEach(async () => {
  app = await makeApp(64, 64);
  stage = new TestStage(app);
});
afterEach(() => {
  destroyApp(app);
  PixelLayer.drainPool();
});

test('a frame of rects lands on the GPU as those pixels, one texel a world pixel', () => {
  const layer = addPixelLayer(stage);
  layer.clear();
  layer.fillStyle(0xff0000).fillRect(10, 10, 3, 2);
  layer.rect(20, 5, 1, 1, 0x00ff00);
  layer.present();
  const f = renderAndRead(app);
  expect(f.at(10, 10)).toEqual(rgb(0xff0000));
  expect(f.at(12, 11)).toEqual(rgb(0xff0000));
  expect(f.at(13, 10)).toEqual(rgb(0));
  expect(f.at(10, 12)).toEqual(rgb(0));
  expect(f.at(20, 5)).toEqual(rgb(0x00ff00));
  expect(f.count((c) => c[0] + c[1] + c[2] > 0)).toBe(7);
  expect(layer.pixelAt(20, 5)).toEqual([0, 255, 0, 255]);
});

test('a translucent rect blends over what the same frame drew under it, as the GPU shows it', () => {
  const layer = addPixelLayer(stage);
  layer.clear();
  layer.rect(0, 0, 4, 4, 0x0000ff);
  layer.rect(2, 0, 4, 4, 0xff0000, 0.5);
  layer.present();
  const f = renderAndRead(app);
  // over blue: half red and half blue; over nothing: half red on the black clear
  const over = f.at(2, 0);
  expect(Math.abs(over[0] - 128)).toBeLessThanOrEqual(2);
  expect(over[1]).toBe(0);
  expect(Math.abs(over[2] - 128)).toBeLessThanOrEqual(2);
  const alone = f.at(5, 0);
  expect(Math.abs(alone[0] - 128)).toBeLessThanOrEqual(2);
  expect(alone[2]).toBe(0);
  expect(f.at(0, 0)).toEqual(rgb(0x0000ff));
  // what the layer says it presented is what was drawn (premultiplied over black)
  const kept = layer.pixelAt(2, 0);
  expect(Math.abs(kept[0] - over[0])).toBeLessThanOrEqual(2);
  expect(Math.abs(kept[2] - over[2])).toBeLessThanOrEqual(2);
});

test('a frame that shrinks is not stretched to the last frame’s size', () => {
  const layer = addPixelLayer(stage);
  layer.clear();
  layer.rect(0, 0, 40, 40, 0xffffff);
  layer.present();
  expect(renderAndRead(app).count((c) => c[0] === 255)).toBe(1600);
  layer.clear();
  layer.rect(5, 5, 2, 2, 0xffffff);
  layer.present();
  const f = renderAndRead(app);
  expect(f.count((c) => c[0] === 255)).toBe(4);
  expect(f.at(5, 5)).toEqual(rgb(0xffffff));
  expect(f.at(7, 7)).toEqual(rgb(0));
});

test('a frame wider than a buffer falls back to Graphics rects and still draws', () => {
  const layer = addPixelLayer(stage);
  layer.clear();
  layer.rect(-2000, 0, 1, 1, 0x00ff00);
  layer.rect(3, 3, 2, 1, 0xff00ff);
  layer.present();
  const f = renderAndRead(app);
  expect(f.at(3, 3)).toEqual(rgb(0xff00ff));
  expect(f.at(4, 3)).toEqual(rgb(0xff00ff));
  expect(f.count((c) => c[0] > 0)).toBe(2);
});

test('a spent buffer goes back to the pool and is reused instead of making a texture', () => {
  const a = addPixelLayer(stage);
  a.clear();
  a.rect(0, 0, 10, 10, 0xffffff);
  a.present();
  const made = PixelLayer.stats().made;
  a.destroy();
  expect(PixelLayer.stats().pooled).toBe(1);
  const b = addPixelLayer(stage);
  b.clear();
  b.rect(30, 30, 10, 10, 0x00ffff);
  b.present();
  expect(PixelLayer.stats().made).toBe(made);
  const f = renderAndRead(app);
  // the reused buffer was cleared: nothing of the first layer's frame is left
  expect(f.count((c) => c[0] === 255)).toBe(0);
  expect(f.count((c) => c[1] === 255 && c[2] === 255)).toBe(100);
});
