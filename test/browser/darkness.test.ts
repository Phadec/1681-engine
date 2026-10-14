import { Sprite, Texture, type Application } from 'pixi.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Darkness } from '../../src/pixel/Darkness';
import { clearLights, flashLight } from '../../src/pixel/lights';
import { destroyApp, makeApp, renderAndRead, TestStage } from './gl';

let app: Application;
let stage: TestStage;
let dark: Darkness | null = null;
let floor: Sprite;
const FLOOR = 0x2060c0;
beforeEach(async () => {
  app = await makeApp(96, 96);
  stage = new TestStage(app);
  // a white floor, so whatever the night leaves of it is read straight off the canvas
  floor = new Sprite(Texture.WHITE);
  floor.setSize(96, 96);
  stage.world.addChild(floor);
});
afterEach(() => {
  dark?.destroy();
  dark = null;
  clearLights();
  destroyApp(app);
});

const lum = (c: number[]) => (c[0]! + c[1]! + c[2]!) / 3;

test('a lamp erases the night: its heart shows the floor in its own colour, outside it is black', () => {
  // a blue floor: light *added* to black would read white or grey here, never blue
  floor.tint = FLOOR;
  dark = new Darkness(stage, 0x000000, 1);
  // a lamp of the floor's own colour, so its wash leaves the floor's colour as it is
  dark.addLamp(48, 48, 24, 0, FLOOR);
  dark.update(0, 0, 0, 0);
  stage.frame(16);
  const f = renderAndRead(app);
  const heart = f.at(48, 48);
  expect(Math.abs(heart[0] - 0x20)).toBeLessThanOrEqual(3);
  expect(Math.abs(heart[1] - 0x60)).toBeLessThanOrEqual(3);
  expect(Math.abs(heart[2] - 0xc0)).toBeLessThanOrEqual(3);
  expect(f.at(2, 2)).toEqual([0, 0, 0, 255]);
  expect(f.at(93, 93)).toEqual([0, 0, 0, 255]);
  // every pixel of the pool is the floor at some share of its brightness: blue stays the strongest channel
  for (let x = 48; x < 70; x++) {
    const c = f.at(x, 48);
    if (c[2] > 0) expect(c[2]).toBeGreaterThan(c[0]);
  }
  // the falloff is dithered between a few levels, not a smooth ramp: few distinct shades along the radius
  const levels = new Set<number>();
  for (let x = 48; x < 76; x++) levels.add(Math.round(f.at(x, 48)[2] / 8));
  expect(levels.size).toBeLessThanOrEqual(8);
  // and it does fall off: darker at three quarters of the radius than at the heart
  expect(f.at(66, 48)[2]).toBeLessThan(heart[2]);
});

test('a lamp lays its own colour on what it lights', () => {
  dark = new Darkness(stage, 0x000000, 1);
  dark.addLamp(48, 48, 24); // the default warm light, on the white floor
  dark.update(0, 0, 0, 0);
  stage.frame(16);
  const heart = renderAndRead(app).at(48, 48);
  expect(heart[0]).toBeGreaterThanOrEqual(250);
  expect(heart[2]).toBeLessThan(heart[0] - 20);
});

test('the carried light follows the player, and a shade with no alpha draws no night', () => {
  dark = new Darkness(stage, 0x000000, 1, { carriedLight: 16 });
  dark.update(0, 20, 26);
  stage.frame(16);
  let f = renderAndRead(app);
  // the carried light sits 6 px above the feet
  expect(lum(f.at(20, 20))).toBeGreaterThan(200);
  expect(lum(f.at(70, 70))).toBe(0);
  dark.update(100, 70, 76);
  stage.frame(16);
  f = renderAndRead(app);
  expect(lum(f.at(70, 70))).toBeGreaterThan(200);
  expect(lum(f.at(20, 20))).toBe(0);
  dark.setShade(0x000000, 0);
  dark.update(200, 70, 76);
  stage.frame(16);
  f = renderAndRead(app);
  expect(f.at(2, 2)).toEqual([255, 255, 255, 255]);
});

test('a transient flash cuts a hole while it lasts', () => {
  dark = new Darkness(stage, 0x000000, 1);
  const now = performance.now();
  flashLight(30, 60, 20, 1000, 0xffffff, now);
  dark.update(now, 0, 0, 0);
  stage.frame(16);
  const f = renderAndRead(app);
  expect(lum(f.at(30, 60))).toBeGreaterThan(200);
  expect(lum(f.at(80, 10))).toBe(0);
});
