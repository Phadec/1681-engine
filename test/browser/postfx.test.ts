import { Container, Graphics, Sprite, Texture, type Application } from 'pixi.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { BloomFilter } from '../../src/postfx/BloomFilter';
import { ChromaticAberrationFilter } from '../../src/postfx/ChromaticAberrationFilter';
import { ColorAdjustFilter } from '../../src/postfx/ColorAdjustFilter';
import { CrtFilter } from '../../src/postfx/CrtFilter';
import { PixelateFilter } from '../../src/postfx/PixelateFilter';
import { PostFx } from '../../src/postfx/PostFx';
import { ShockwaveFilter } from '../../src/postfx/ShockwaveFilter';
import { VignetteFilter } from '../../src/postfx/VignetteFilter';
import { engineSettings } from '../../src/settings';
import { destroyApp, makeApp, renderAndRead, rgb } from './gl';

const W = 64;
const H = 64;
let app: Application;
let scene: Container;
let post: PostFx | null = null;
beforeEach(async () => {
  app = await makeApp(W, H);
  scene = new Container();
  app.stage.addChild(scene);
});
afterEach(() => {
  post?.destroy();
  post = null;
  engineSettings.reset();
  destroyApp(app);
});

function fill(color: number, x = 0, y = 0, w = W, h = H): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.tint = color;
  s.position.set(x, y);
  s.setSize(w, h);
  scene.addChild(s);
  return s;
}

const near = (a: number[], b: number[], tol = 3) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]!) <= tol);
const lum = (c: number[]) => (c[0]! + c[1]! + c[2]!) / 3;
const read = () => renderAndRead(app);
function countDiff(a: ReturnType<typeof read>, b: ReturnType<typeof read>): number {
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a.at(x, y)[0] !== b.at(x, y)[0]) n++;
  return n;
}

test('the chain keeps its order, takes an index, and only the enabled effects reach the target', () => {
  post = new PostFx(app.stage, app.screen);
  const a = post.add(new VignetteFilter());
  const b = post.add(new PixelateFilter(2));
  const c = post.add(new CrtFilter(), 0);
  expect(post.filters).toEqual([c, a, b]);
  expect(app.stage.filters).toEqual([c, a, b]);
  post.setEnabled(a, false);
  expect(post.isEnabled(a)).toBe(false);
  expect(post.filters).toEqual([c, a, b]);
  expect(app.stage.filters).toEqual([c, b]);
  post.setEnabled(a, true);
  expect(app.stage.filters).toEqual([c, a, b]);
  post.remove(c);
  expect(post.filters).toEqual([a, b]);
  expect(post.isEnabled(c)).toBe(false);
  post.remove(c); // twice is nothing
  post.remove(a);
  post.remove(b);
  expect(app.stage.filters).toEqual([]);
  a.destroy();
  b.destroy();
  c.destroy();
});

test('a vignette darkens the corners and leaves the centre, towards its colour', () => {
  fill(0xffffff);
  post = new PostFx(app.stage, app.screen);
  const v = post.add(new VignetteFilter({ strength: 1, radius: 0.3, softness: 0.4 }));
  let f = read();
  expect(near(f.at(32, 32), rgb(0xffffff))).toBe(true);
  expect(lum(f.at(1, 1))).toBeLessThan(40);
  v.color = 0xff0000;
  f = read();
  expect(f.at(1, 1)[0]).toBeGreaterThan(240);
  expect(f.at(1, 1)[1]).toBeLessThan(40);
  v.strength = 0;
  expect(v.strength).toBe(0);
  expect(near(read().at(1, 1), rgb(0xffffff))).toBe(true);
});

test('the colour adjustment: brightness, saturation, contrast, tint', () => {
  fill(0x80c040);
  post = new PostFx(app.stage, app.screen);
  const c = post.add(new ColorAdjustFilter({ brightness: 0.5 }));
  expect(near(read().at(10, 10), [0x40, 0x60, 0x20], 4)).toBe(true);
  c.brightness = 1;
  c.saturation = 0;
  const grey = read().at(10, 10);
  expect(Math.abs(grey[0] - grey[1])).toBeLessThanOrEqual(2);
  expect(Math.abs(grey[1] - grey[2])).toBeLessThanOrEqual(2);
  c.saturation = 1;
  c.contrast = 0;
  expect(near(read().at(10, 10), [128, 128, 128], 3)).toBe(true);
  c.contrast = 1;
  c.tint = 0x0000ff;
  c.tintAmount = 1;
  const tinted = read().at(10, 10);
  expect(tinted[0]).toBeLessThan(3);
  expect(Math.abs(tinted[2] - 0x40)).toBeLessThanOrEqual(3);
  expect([c.brightness, c.contrast, c.saturation, c.tintAmount]).toEqual([1, 1, 1, 1]);
});

test('pixelate turns a one-pixel checker into flat blocks; size 1 leaves it be', () => {
  const g = new Graphics();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + y) % 2 === 0) g.rect(x, y, 1, 1);
  g.fill(0xffffff);
  scene.addChild(g);
  post = new PostFx(app.stage, app.screen);
  const p = post.add(new PixelateFilter(4));
  let f = read();
  for (let by = 0; by < 4; by++)
    for (let bx = 0; bx < 4; bx++) {
      const first = f.at(bx * 4, by * 4);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) expect(f.at(bx * 4 + x, by * 4 + y)).toEqual(first);
    }
  p.size = 1;
  expect(p.size).toBe(1);
  f = read();
  expect(f.at(0, 0)).not.toEqual(f.at(1, 0));
});

test('chromatic aberration splits red and blue at the edges and not at the centre', () => {
  // a white bar down the middle and one at the left edge
  fill(0xffffff, 30, 0, 4, H);
  fill(0xffffff, 4, 0, 4, H);
  post = new PostFx(app.stage, app.screen);
  post.add(new ChromaticAberrationFilter(3));
  const f = read();
  expect(f.at(31, 32)).toEqual(rgb(0xffffff));
  // near the left edge the split is about 3 × 0.875 px: red is pulled in from the left, blue from the right
  const reds = f.count((c) => c[0] > 200 && c[2] < 50, 0, 32, 12, 33);
  const blues = f.count((c) => c[2] > 200 && c[0] < 50, 0, 32, 12, 33);
  expect(reds).toBeGreaterThan(0);
  expect(blues).toBeGreaterThan(0);
});

test('a CRT blacks out beyond its bulging glass and lays scanlines over the picture', () => {
  fill(0xffffff);
  post = new PostFx(app.stage, app.screen);
  post.add(new CrtFilter({ curvature: 0.3, scanlines: 1, lineHeight: 4, cornerShade: 0 }));
  const f = read();
  expect(f.at(0, 0)).toEqual([0, 0, 0, 255]);
  const column = Array.from({ length: 16 }, (_, k) => lum(f.at(32, 24 + k)));
  expect(Math.max(...column) - Math.min(...column)).toBeGreaterThan(100);
});

test('bloom spreads light from what is above its threshold and nothing from what is under', () => {
  fill(0x000000);
  fill(0xffffff, 14, 30, 4, 4);
  fill(0x404040, 46, 30, 4, 4);
  post = new PostFx(app.stage, app.screen);
  const bloom = post.add(new BloomFilter({ threshold: 0.6, blur: 6, quality: 3 }));
  const f = read();
  expect(lum(f.at(16, 26))).toBeGreaterThan(5);
  expect(lum(f.at(48, 26))).toBe(0);
  bloom.intensity = 0;
  expect(lum(read().at(16, 26))).toBe(0);
  bloom.threshold = 0.1;
  bloom.blur = 2;
  expect([bloom.threshold, bloom.blur]).toEqual([0.1, 2]);
});

test('a shockwave bends the picture at its ring and is gone, and freed, when it ends', () => {
  // vertical stripes: a bend shows as a stripe moved sideways
  for (let x = 0; x < W; x += 8) fill(0xffffff, x, 0, 4, H);
  post = new PostFx(app.stage, app.screen);
  const flat = read();
  post.shockwave(32, 32, { amplitude: 6, width: 0.15, reach: 0.6, ms: 100 });
  expect(app.stage.filters!.length).toBe(1);
  expect(app.stage.filters![0]).toBeInstanceOf(ShockwaveFilter);
  post.update(40);
  expect(countDiff(flat, read())).toBeGreaterThan(20);
  post.update(100);
  expect(app.stage.filters).toEqual([]);
  expect(countDiff(flat, read())).toBe(0);
});

test('a flash washes towards its colour and fades away over its time', () => {
  fill(0x000000);
  post = new PostFx(app.stage, app.screen);
  post.flash({ color: 0xff0000, strength: 1, ms: 100 });
  expect(post.color.flash).toBe(1);
  expect(read().at(10, 10)[0]).toBeGreaterThan(250);
  post.update(50);
  const half = read().at(10, 10)[0];
  expect(half).toBeGreaterThan(5);
  expect(half).toBeLessThan(250);
  post.update(60);
  expect(post.color.flash).toBe(0);
  expect(read().at(10, 10)).toEqual([0, 0, 0, 255]);
  // the colour stage was put first and stays
  expect(post.filters[0]).toBe(post.color);
});

test('reduced effects skip flashes and shockwaves, unless told not to honour them', () => {
  engineSettings.set({ reducedFx: true });
  post = new PostFx(app.stage, app.screen);
  post.flash();
  post.shockwave(10, 10);
  expect(app.stage.filters ?? []).toEqual([]);
  post.destroy();
  post = new PostFx(app.stage, app.screen, { honourReducedFx: false });
  post.flash();
  post.shockwave(10, 10);
  expect(app.stage.filters!.length).toBe(2);
});

test('animate eases any number by name, and calls done at the end', () => {
  post = new PostFx(app.stage, app.screen);
  const seen: number[] = [];
  let done = 0;
  post.animate((v) => seen.push(v), 0, 10, 100, 'Linear', () => done++);
  post.update(50);
  post.update(50);
  expect(seen.at(-1)).toBe(10);
  expect(seen.some((v) => Math.abs(v - 5) < 1e-6)).toBe(true);
  expect(done).toBe(1);
});

test('a backdrop lets effects reach the empty background; without one it stays untouched', () => {
  // nothing drawn at all: only the clear colour
  post = new PostFx(app.stage, app.screen, { backdrop: 0xffffff });
  post.add(new VignetteFilter({ strength: 1, radius: 0.2, softness: 0.3 }));
  let f = read();
  expect(near(f.at(32, 32), rgb(0xffffff))).toBe(true);
  expect(lum(f.at(0, 0))).toBeLessThan(40);
  post.destroy();
  expect(app.stage.children.find((c) => c.label === 'postfx-backdrop')).toBeUndefined();
  post = new PostFx(scene, app.screen);
  post.add(new ColorAdjustFilter({ brightness: 0 }));
  f = read();
  expect(f.at(0, 0)).toEqual([0, 0, 0, 255]);
});

test('over a zoomed and moved layer the filtered area is still the screen', () => {
  fill(0xffffff, 0, 0, 400, 400);
  scene.scale.set(2);
  scene.position.set(-50, -30);
  post = new PostFx(scene, app.screen);
  // the layer's transform is worked out by a render; on an engine the frame after it updates the area
  read();
  post.update(0);
  expect(scene.filterArea!.x).toBeCloseTo(25);
  expect(scene.filterArea!.y).toBeCloseTo(15);
  expect(scene.filterArea!.width).toBeCloseTo(32);
  expect(scene.filterArea!.height).toBeCloseTo(32);
  post.add(new VignetteFilter({ strength: 1, radius: 0.3, softness: 0.4 }));
  const f = read();
  // the vignette is centred on the screen, not on the layer's own bounds
  expect(near(f.at(32, 32), rgb(0xffffff))).toBe(true);
  expect(lum(f.at(1, 1))).toBeLessThan(40);
  expect(lum(f.at(62, 62))).toBeLessThan(40);
});

test('destroy takes every effect off and finishes what was running', () => {
  post = new PostFx(app.stage, app.screen);
  post.add(new VignetteFilter());
  let finished = 0;
  post.animate(() => undefined, 0, 1, 1000, undefined, () => finished++);
  post.destroy();
  expect(app.stage.filters).toEqual([]);
  expect(finished).toBe(1);
  post = null;
});
