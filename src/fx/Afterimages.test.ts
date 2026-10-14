import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Image } from '../core/Image.ts';
import type { Stage } from '../core/Stage.ts';
import { Tweener } from '../core/Tweener.ts';
import { Afterimages } from './Afterimages.ts';

/** An image with the parts the trail touches; a real one needs a texture node cannot make. */
class FakeImage {
  x = 0;
  y = 0;
  alpha = 1;
  visible = true;
  destroyed = false;
  scaleX = 1;
  scaleY = 1;
  rotation = 0;
  flipX = false;
  originX = 0.5;
  originY = 1;
  depth = 0;
  tint = 0xffffff;
  blend = 'normal';
  texture: unknown = null;
  constructor(public textureKey: string, public frameName: string) {}
  setTexture(key: string, frame: string): this { this.textureKey = key; this.frameName = frame; return this; }
  setPosition(x: number, y: number): this { this.x = x; this.y = y; return this; }
  setVisible(v: boolean): this { this.visible = v; return this; }
  setOrigin(): this { return this; }
  setFlipX(v: boolean): this { this.flipX = v; return this; }
  setScale(x: number, y: number): this { this.scaleX = x; this.scaleY = y; return this; }
  setRotation(r: number): this { this.rotation = r; return this; }
  setAlpha(a: number): this { this.alpha = a; return this; }
  setDepth(d: number): this { this.depth = d; return this; }
  setBlendMode(b: string): this { this.blend = b; return this; }
  destroy(): void { this.destroyed = true; }
}

function fakeStage() {
  const made: FakeImage[] = [];
  const removed: string[] = [];
  const tweens = new Tweener();
  const stage = {
    tweens,
    textures: {
      isLive: () => true,
      snapshotInto: () => {},
      get: () => ({ source: { resource: null, update() {} } }),
      remove: (k: string) => removed.push(k),
    },
    add: {
      image: (x: number, y: number, key: string, frame: string) => {
        const img = new FakeImage(key, frame).setPosition(x, y);
        made.push(img);
        return img;
      },
    },
  };
  return { stage: stage as unknown as Stage, made, removed, tweens };
}

const body = new FakeImage('hero', '0') as unknown as Image;

test('copies are spaced, tinted in turn, fade out, and a live body reuses its ring of textures', () => {
  const { stage, made, removed, tweens } = fakeStage();
  const trail = new Afterimages(stage, { tints: [0xff0000, 0x00ff00], spacingMs: 20, durationMs: 100, slots: 2 });
  const a = trail.trail(body, 10, 20, 0);
  assert.ok(a);
  assert.equal(trail.trail(body, 11, 20, 10), null, 'too soon');
  const b = trail.trail(body, 12, 20, 20);
  assert.equal((a as unknown as FakeImage).tint, 0xff0000);
  assert.equal((b as unknown as FakeImage).tint, 0x00ff00);
  assert.equal((a as unknown as FakeImage).depth, 19);
  assert.equal((a as unknown as FakeImage).blend, 'add');
  assert.equal(trail.active, 2);
  // the ring has two slots: the third copy takes the first one's image, cutting its fade short
  const c = trail.trail(body, 14, 20, 40);
  assert.equal(c, a);
  assert.equal(made.length, 2);
  tweens.update(200);
  assert.equal(trail.active, 0);
  assert.equal((c as unknown as FakeImage).visible, false);
  trail.destroy();
  assert.ok(made.every((m) => m.destroyed));
  assert.equal(removed.length, 2);
});
