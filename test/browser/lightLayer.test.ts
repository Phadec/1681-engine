import { Sprite, Texture, type Application } from 'pixi.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { LightLayer } from '../../src/light/LightLayer';
import { destroyApp, makeApp, renderAndRead, TestStage } from './gl';

let app: Application;
let stage: TestStage;
let night: LightLayer | null = null;
beforeEach(async () => {
  app = await makeApp(96, 96);
  stage = new TestStage(app);
  // a white floor, so whatever the night leaves of it is read straight off the canvas
  const floor = new Sprite(Texture.WHITE);
  floor.setSize(400, 400);
  stage.world.addChild(floor);
});
afterEach(() => {
  night?.destroy();
  night = null;
  destroyApp(app);
});

const lum = (c: number[]) => (c[0]! + c[1]! + c[2]!) / 3;

/** One frame: the camera placed, the lights drawn into the dark, the canvas read back. */
function draw(now = 0) {
  stage.frame(16);
  night!.update(now);
  return renderAndRead(app);
}

test('a light erases a soft hole in the dark: bright at its heart, falling off, black past its radius', () => {
  night = new LightLayer(stage, { ambient: 0x000000, darkness: 1, tint: 0 });
  night.add({ x: 48, y: 48, radius: 30 });
  const f = draw();
  expect(lum(f.at(48, 48))).toBeGreaterThan(240);
  expect(lum(f.at(48 + 20, 48))).toBeLessThan(lum(f.at(48 + 5, 48)));
  expect(lum(f.at(2, 2))).toBe(0);
  expect(lum(f.at(93, 93))).toBe(0);
});

test('the dark has the ambient colour at the darkness asked for, and none at all at 0', () => {
  night = new LightLayer(stage, { ambient: 0x0000ff, darkness: 0.5 });
  let c = draw().at(10, 10);
  // half of the white floor, half of blue
  expect(c[2]).toBeGreaterThan(245);
  expect(Math.abs(c[0] - 128)).toBeLessThanOrEqual(3);
  night.setAmbient(0x000000, 0);
  c = draw().at(10, 10);
  expect(c).toEqual([255, 255, 255, 255]);
  // out of range is clamped, not inverted
  night.setAmbient(0x000000, 7);
  expect(lum(draw().at(10, 10))).toBe(0);
});

test('a light lays its colour over what it lights, by the tint share', () => {
  // a grey floor, so an added colour shows rather than clipping at white
  (stage.world.children[0] as Sprite).tint = 0x404040;
  night = new LightLayer(stage, { ambient: 0x000000, darkness: 1, tint: 1 });
  night.add({ x: 48, y: 48, radius: 30, color: 0xff0000 });
  const heart = draw().at(48, 48);
  expect(heart[0]).toBeGreaterThan(heart[1] + 100);
  expect(Math.abs(heart[1] - 0x40)).toBeLessThanOrEqual(4);
});

test('a light off, of no radius, or of no intensity lights nothing; turned back on it does', () => {
  night = new LightLayer(stage, { ambient: 0x000000, darkness: 1, tint: 0 });
  const lamp = night.add({ x: 48, y: 48, radius: 30, on: false });
  night.add({ x: 20, y: 20, radius: 0 });
  night.add({ x: 76, y: 76, radius: 20, intensity: 0 });
  let f = draw();
  expect(lum(f.at(48, 48))).toBe(0);
  expect(lum(f.at(20, 20))).toBe(0);
  expect(lum(f.at(76, 76))).toBe(0);
  lamp.on = true;
  f = draw();
  expect(lum(f.at(48, 48))).toBeGreaterThan(240);
  night.remove(lamp);
  expect(lum(draw().at(48, 48))).toBe(0);
});

test('lights are placed in the world: they move on the screen with the camera, and scale with its zoom', () => {
  night = new LightLayer(stage, { ambient: 0x000000, darkness: 1, tint: 0 });
  night.add({ x: 148, y: 24, radius: 12 });
  expect(lum(draw().at(48, 24))).toBe(0);
  stage.cameras.main.setScroll(100, 0);
  let f = draw();
  expect(lum(f.at(48, 24))).toBeGreaterThan(240);
  // 12 world px of radius: 20 px off the heart is dark at zoom 1
  expect(lum(f.at(48 + 20, 24))).toBe(0);
  stage.cameras.main.setZoom(2);
  f = draw();
  // the heart is now at ((148 − 100) × 2, 24 × 2) = (96, 48), on the right edge, 24 px of radius
  expect(lum(f.at(90, 48))).toBeGreaterThan(200);
  expect(lum(f.at(90, 48))).toBeGreaterThan(lum(f.at(76, 48)));
  expect(lum(f.at(60, 48))).toBe(0);
  expect(lum(f.at(48, 24))).toBe(0);
});

test('squash flattens a light into an ellipse: as wide as before, shorter', () => {
  night = new LightLayer(stage, { ambient: 0x000000, darkness: 1, tint: 0, squash: 0.5 });
  night.add({ x: 48, y: 48, radius: 30 });
  const f = draw();
  expect(lum(f.at(48 + 18, 48))).toBeGreaterThan(0);
  expect(lum(f.at(48, 48 + 18))).toBe(0);
});

test('a flickering light changes size from frame to frame; a steady one does not', () => {
  night = new LightLayer(stage, { ambient: 0x000000, darkness: 1, tint: 0 });
  const torch = night.add({ x: 48, y: 48, radius: 30, flicker: 0.5 });
  const edge = (now: number) => lum(draw(now).at(48 + 24, 48));
  const seen = new Set([0, 400, 800, 1200, 1600].map((t) => Math.round(edge(t))));
  expect(seen.size).toBeGreaterThan(1);
  torch.flicker = 0;
  const steady = new Set([0, 400, 800].map((t) => Math.round(edge(t))));
  expect(steady.size).toBe(1);
});

test('more lights than ever before grow the pool; fewer hide the rest', () => {
  night = new LightLayer(stage, { ambient: 0x000000, darkness: 1, tint: 0 });
  for (const x of [16, 48, 80]) night.add({ x, y: 48, radius: 8 });
  let f = draw();
  for (const x of [16, 48, 80]) expect(lum(f.at(x, 48))).toBeGreaterThan(200);
  night.clear();
  night.add({ x: 48, y: 48, radius: 8 });
  f = draw();
  expect(lum(f.at(48, 48))).toBeGreaterThan(200);
  expect(lum(f.at(16, 48))).toBe(0);
  expect(lum(f.at(80, 48))).toBe(0);
});

test('the dark follows a resize of the stage', () => {
  night = new LightLayer(stage, { ambient: 0x000000, darkness: 1 });
  app.renderer.resize(128, 96);
  const f = draw();
  expect(f.width).toBe(128);
  expect(lum(f.at(120, 10))).toBe(0);
});
