import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridPlacement } from './gridPlacement.ts';

test('the texture starts on the whole world pixel at the corner and is moved by the fraction', () => {
  // the camera scrolled to x = 10.25 world px at zoom 2: the origin lands at -20.5 screen px
  const at = gridPlacement(-20.5, -8, 2, 2, 640, 360);
  assert.equal(at.tx, 10);
  assert.equal(at.ty, 4);
  assert.equal(at.x, -0.5);
  assert.equal(at.y, 0);
});

test('a world pixel maps back to the same screen point as drawing the world straight', () => {
  for (const [ox, oy, zoom, res] of [[-37, -91, 3, 1], [-20.5, -13.5, 1.5, 2], [5, 7, 2, 1], [-1001, -2, 4, 1]] as const) {
    const at = gridPlacement(ox, oy, zoom, res, 800, 600);
    for (const w of [0, 13, 250]) {
      assert.equal(at.x + (w - at.tx) * zoom, ox + w * zoom, `x at zoom ${zoom}`);
      assert.equal(at.y + (w - at.ty) * zoom, oy + w * zoom, `y at zoom ${zoom}`);
    }
  }
});

test('the offset is never a whole world pixel or more, and always a whole backing pixel', () => {
  for (let ox = -60; ox <= 0; ox += 0.5) {
    const at = gridPlacement(ox, 0, 1.5, 2, 320, 180);
    assert.ok(at.x <= 0 && at.x > -1.5, `offset ${at.x} for origin ${ox}`);
    assert.equal(at.x * 2, Math.round(at.x * 2));
  }
});

test('the texture covers the screen from wherever it starts', () => {
  const at = gridPlacement(-1.9, -1.9, 2, 1, 641, 359);
  assert.ok(at.x + at.width * 2 >= 641);
  assert.ok(at.y + at.height * 2 >= 359);
});
