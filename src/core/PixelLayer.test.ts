import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PixelLayer } from './PixelLayer';

// The pixel effects are shown through PixelLayer: it must lay exactly the pixels the rects covered,
// a later opaque rect over an earlier one, a translucent one blended over what is under it, and nothing elsewhere.

test('opaque rects land on whole pixels, the later one on top', () => {
  const g = new PixelLayer();
  g.clear();
  g.fillStyle(0xff0000).fillRect(-3, -2, 4, 2);
  g.fillStyle(0x0000ff).fillRect(0, -1, 2, 1);
  g.present();
  assert.deepEqual(g.pixelAt(-3, -2), [255, 0, 0, 255]);
  assert.deepEqual(g.pixelAt(-1, -1), [255, 0, 0, 255]);
  assert.deepEqual(g.pixelAt(0, -1), [0, 0, 255, 255]);
  assert.deepEqual(g.pixelAt(1, -1), [0, 0, 255, 255]);
  assert.deepEqual(g.pixelAt(1, -2), [0, 0, 0, 0]);
  assert.deepEqual(g.pixelAt(5, 5), [0, 0, 0, 0]);
  g.destroy();
});

test('a translucent rect blends over the pixels painted before it, premultiplied', () => {
  const g = new PixelLayer();
  g.clear();
  g.fillStyle(0x000000).fillRect(0, 0, 1, 1);
  g.fillStyle(0xffffff, 0.5).fillRect(0, 0, 2, 1);
  g.present();
  // over black: half white, opaque
  assert.deepEqual(g.pixelAt(0, 0), [127, 127, 127, 255]);
  // over nothing: half white at half alpha, premultiplied
  assert.deepEqual(g.pixelAt(1, 0), [127, 127, 127, 127]);
  g.destroy();
});

test('a frame clears the last one, and an empty frame shows nothing', () => {
  const g = new PixelLayer();
  g.clear();
  g.fillStyle(0x00ff00).fillRect(0, 0, 40, 40);
  g.present();
  g.clear();
  g.fillStyle(0x00ff00).fillRect(10, 10, 1, 1);
  g.present();
  assert.deepEqual(g.pixelAt(10, 10), [0, 255, 0, 255]);
  assert.deepEqual(g.pixelAt(11, 10), [0, 0, 0, 0]);
  g.clear();
  g.present();
  assert.deepEqual(g.pixelAt(10, 10), [0, 0, 0, 0]);
  g.destroy();
});

test('a frame smaller than the last is not stretched to the old size', () => {
  const g = new PixelLayer();
  g.clear();
  g.fillStyle(0xffffff).fillRect(0, -90, 10, 90);
  g.present();
  g.clear();
  g.fillStyle(0xffffff).fillRect(0, -20, 10, 20);
  g.present();
  // pixelAt throws if the sprite no longer shows one texel a pixel
  assert.deepEqual(g.pixelAt(0, -20), [255, 255, 255, 255]);
  assert.deepEqual(g.pixelAt(0, -21), [0, 0, 0, 0]);
  assert.deepEqual(g.pixelAt(9, -1), [255, 255, 255, 255]);
  g.destroy();
});

test('a destroyed layer hands its texture to the next layer of its size class instead of a new one', () => {
  PixelLayer.drainPool();
  const a = new PixelLayer();
  a.clear();
  a.fillStyle(0xffffff).fillRect(0, 0, 20, 20);
  a.present();
  const made = PixelLayer.stats().made;
  a.destroy();
  assert.equal(PixelLayer.stats().pooled, 1);
  const b = new PixelLayer();
  b.clear();
  b.fillStyle(0xff0000).fillRect(5, 5, 18, 17);
  b.present();
  assert.equal(PixelLayer.stats().made, made, 'no new texture');
  assert.equal(PixelLayer.stats().pooled, 0);
  // the reused buffer is cleared: nothing of the last layer's frame shows
  assert.deepEqual(b.pixelAt(22, 21), [255, 0, 0, 255]);
  assert.deepEqual(b.pixelAt(23, 22), [0, 0, 0, 0]);
  b.destroy();
  PixelLayer.drainPool();
  assert.equal(PixelLayer.stats().pooled, 0);
});

test('a layer grows by size classes, and trades a buffer it no longer fills for a smaller one', () => {
  const g = new PixelLayer();
  g.clear();
  g.fillStyle(0xffffff).fillRect(0, 0, 33, 10);
  g.present();
  assert.deepEqual(g.capacity(), { w: 48, h: 16 });
  g.clear();
  g.fillStyle(0xffffff).fillRect(0, 0, 300, 200);
  g.present();
  assert.deepEqual(g.capacity(), { w: 384, h: 256 });
  for (let i = 0; i < 70; i++) {
    g.clear();
    g.fillStyle(0xffffff).fillRect(0, 0, 10, 10);
    g.present();
  }
  assert.deepEqual(g.capacity(), { w: 16, h: 16 });
  assert.deepEqual(g.pixelAt(9, 9), [255, 255, 255, 255]);
  g.destroy();
});

test('staged runs land after what was drawn before the commit, the later run winning', () => {
  const g = new PixelLayer();
  g.clear();
  g.fillStyle(0x0000ff).fillRect(0, 0, 4, 1);
  g.stage(1, 0, 2, 0xff0000);
  g.stage(2, 0, 1, 0x00ff00);
  g.commit();
  g.fillStyle(0xffffff, 0.5).fillRect(0, 0, 1, 1);
  g.present();
  assert.deepEqual(g.pixelAt(0, 0), [127, 127, 255, 255]);
  assert.deepEqual(g.pixelAt(1, 0), [255, 0, 0, 255]);
  assert.deepEqual(g.pixelAt(2, 0), [0, 255, 0, 255]);
  assert.deepEqual(g.pixelAt(3, 0), [0, 0, 255, 255]);
  g.destroy();
});

test('the pixel effects lay the same pixels straight into a layer as through the rects', async () => {
  const paint = await import('../fx/pixelPaint');
  const tone = await import('../fx/pixelTone');
  const shapes = (g: never) => {
    paint.ring(g, 14, 0xc8a0ff, 3, 2);
    paint.arc(g, 2, -4, 11, 0.2, 2.6, 0xff7438, true, 2);
    paint.blob(g, -6, 3, 5, 0x71d8ef, true);
    paint.stroke(g, { x: -12, y: -9 }, { x: 13, y: 6 }, 0xffd98a, 3);
    paint.diamond(g, 6, -8, 5, 0xa0b0ff);
    paint.dot(g, 3, 3, 0xffffff, 2);
    paint.hline(g, -9, 8, 12, 0x9fe6ff);
    paint.puffBlob(g, 4, 6, 6, 0x8e8a92, 0xd6d0c8, 2, 0.7);
    paint.outlined(g, 0x1a1020, () => paint.diamond(g, -10, -3, 4, 0xff4a3a));
    paint.dot(g, 0, 0, 0x00ff00);
  };
  for (const coverage of [1, 0.55]) {
    const direct = new PixelLayer();
    const viaRects = new PixelLayer();
    // not a PixelLayer, so the batch takes the map-and-runs path, and hands the rects to a layer
    const proxy = {
      fillStyle: (c: number, a?: number) => (viaRects.fillStyle(c, a), proxy),
      fillRect: (x: number, y: number, w: number, h: number) => (viaRects.fillRect(x, y, w, h), proxy),
    };
    for (const [g, target] of [[direct, direct], [proxy, viaRects]] as const) {
      target.clear();
      tone.setCoverage(coverage);
      tone.beginBatch(g as never);
      shapes(g as never);
      tone.endBatch();
      tone.setCoverage(1);
      target.present();
    }
    let lit = 0;
    for (let y = -30; y <= 30; y++) {
      for (let x = -30; x <= 30; x++) {
        const px = direct.pixelAt(x, y);
        if (px[3] > 0) lit++;
        assert.deepEqual(px, viaRects.pixelAt(x, y), `pixel ${x},${y} at coverage ${coverage}`);
      }
    }
    assert.ok(lit > 200, `only ${lit} pixels painted`);
    direct.destroy();
    viaRects.destroy();
  }
});

test("Pixi's batch texture table forgets a texture when cleared (the leak patch)", async () => {
  const { BatchTextureArray } = await import('pixi.js');
  const { patchPixi } = await import('./pixiPatches');
  assert.ok(patchPixi(), 'the patch applies to this Pixi');
  const arr = new BatchTextureArray() as unknown as { ids: Record<number, number | null>; textures: unknown[]; count: number; clear(): void };
  for (let i = 0; i < 3; i++) {
    arr.ids[1000 + i] = arr.count;
    arr.textures[arr.count++] = { uid: 1000 + i };
  }
  arr.clear();
  assert.equal(arr.count, 0);
  assert.deepEqual(Object.keys(arr.ids), []);
  assert.equal(arr.ids[1001] ?? null, null);
});

test('a frame wider than the buffer falls back to the Graphics and ends', () => {
  const g = new PixelLayer();
  g.clear();
  // two pixels 3000 world pixels apart: past MAX_SIDE, so the rects go to the Graphics underneath
  g.fillStyle(0xffffff).fillRect(0, 0, 1, 1);
  g.fillStyle(0xff0000).fillRect(3000, 0, 1, 1);
  g.present();
  assert.equal(g.reach(), 0);
  g.destroy();
});

test('a rect or a run off to Infinity or NaN is dropped, never stretching the frame', () => {
  const g = new PixelLayer();
  g.clear();
  g.rect(0, 0, 1, 1, 0xffffff);
  g.rect(Infinity, 0, 1, 1, 0xffffff);
  g.rect(0, Number.NaN, 1, 1, 0xffffff);
  g.stage(-Infinity, 0, 2, 0xff0000);
  g.present();
  assert.deepEqual(g.pixelAt(0, 0), [255, 255, 255, 255]);
  assert.ok(g.reach() < 4);
  g.destroy();
});
