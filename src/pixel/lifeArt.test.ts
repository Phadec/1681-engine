import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUFF_FRAMES, puffPixels } from './lifeArt';

test('a puff grows frame by frame and dithers out in its last two', () => {
  let last = 0;
  for (let f = 0; f < PUFF_FRAMES; f++) {
    const { w, h, px } = puffPixels(f);
    assert.ok(w * h >= last, `frame ${f} no smaller`);
    last = w * h;
    for (const [x, y] of px) assert.ok(Number.isInteger(x) && Number.isInteger(y) && x < w && y < h);
    if (f >= PUFF_FRAMES - 2) for (const [x, y] of px) assert.equal((x + y + f) % 2, 0);
  }
  const { px } = puffPixels(1, ['#ffffff', '#808080', '#000000']);
  assert.ok(px.some(([, , c]) => c === 'rgba(255,255,255,0.9)'));
  assert.ok(px.length > 0);
});
