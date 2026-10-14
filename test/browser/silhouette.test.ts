import { Sprite } from 'pixi.js';
import { afterEach, expect, test } from 'vitest';
import { TextureRegistry } from '../../src/core/TextureRegistry';
import { clearSilhouettes, solidSilhouette } from '../../src/core/silhouette';
import { canvasOf, destroyApp, makeApp, renderAndRead, rgb } from './gl';

afterEach(() => clearSilhouettes());

/** A 4×4 frame on a sheet: an opaque blue pixel, a half-transparent green one, and empty pixels round them. */
function sheet(): TextureRegistry {
  const textures = new TextureRegistry();
  const canvas = canvasOf(8, 4, (c) => {
    c.fillStyle = '#808080';
    c.fillRect(0, 0, 4, 4); // frame 0, which the silhouette of frame 1 must not take any of
    c.fillStyle = '#0000ff';
    c.fillRect(5, 1, 1, 1);
    c.fillStyle = 'rgba(0, 255, 0, 0.5)';
    c.fillRect(6, 2, 1, 1);
  });
  textures.addSpriteSheet('body', canvas, { frameWidth: 4, frameHeight: 4 });
  return textures;
}

test('reads the frame back and paints its opaque pixels one colour, alpha kept', () => {
  const tex = sheet().get('body', 1);
  const sil = solidSilhouette(tex, 0xff0000)!;
  expect(sil).not.toBe(null);
  expect([sil.width, sil.height]).toEqual([4, 4]);
  const canvas = sil.source.resource as HTMLCanvasElement;
  const px = canvas.getContext('2d')!.getImageData(0, 0, 4, 4).data;
  const at = (x: number, y: number) => Array.from(px.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4));
  expect(at(1, 1)).toEqual([255, 0, 0, 255]);
  const half = at(2, 2);
  expect(half.slice(0, 3)).toEqual([255, 0, 0]);
  expect(Math.abs(half[3]! - 128)).toBeLessThanOrEqual(1);
  expect(at(0, 0)).toEqual([0, 0, 0, 0]);
  // cached per frame and colour
  expect(solidSilhouette(tex, 0xff0000)).toBe(sil);
  expect(solidSilhouette(tex, 0xffffff)).not.toBe(sil);
});

test('the silhouette draws on the GPU as the colour where the body is, nothing elsewhere', async () => {
  const app = await makeApp(8, 8);
  try {
    const sil = solidSilhouette(sheet().get('body', 1))!;
    const sprite = new Sprite(sil);
    sprite.tint = 0x00ffff;
    app.stage.addChild(sprite);
    const f = renderAndRead(app);
    expect(f.at(1, 1)).toEqual(rgb(0x00ffff));
    expect(f.at(0, 0)).toEqual(rgb(0));
    const half = f.at(2, 2);
    expect(half[0]).toBe(0);
    expect(Math.abs(half[1] - 128)).toBeLessThanOrEqual(2);
    expect(f.count((c) => c[1] > 0)).toBe(2);
  } finally {
    destroyApp(app);
  }
});

test('a cleared silhouette is made again, and a turned frame gives none', () => {
  const textures = sheet();
  const tex = textures.get('body', 1);
  const first = solidSilhouette(tex)!;
  clearSilhouettes(tex);
  expect(first.destroyed).toBe(true);
  expect(solidSilhouette(tex)).not.toBe(first);
  const turned = textures.addCanvas('turned', canvasOf(4, 4, () => {}));
  turned.addPacked({ name: 't', x: 0, y: 0, w: 2, h: 4, rotated: true, sourceW: 4, sourceH: 2 });
  expect(solidSilhouette(textures.get('turned', 't'))).toBe(null);
});
