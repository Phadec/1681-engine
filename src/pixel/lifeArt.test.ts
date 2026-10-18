import assert from 'node:assert/strict';
import { test } from 'node:test';
import { packShelves, PUFF_FRAMES, puffPixels } from './lifeArt';

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

test('the life art is laid on one page: pieces in rows, a clear pixel apart, none overlapping or past the edge', () => {
  const sizes: [number, number][] = [[2, 1], [2, 2], [1, 2], [3, 2], [5, 2], [7, 5], [6, 5], [3, 3], [30, 4], [40, 1]];
  const { at, height } = packShelves(sizes, 32);
  const boxes = sizes.map(([w, h], i) => ({ x: at[i]![0], y: at[i]![1], w, h }));
  for (const b of boxes) assert.ok(b.x === 0 || b.x + b.w <= 32, 'inside the page (or alone on its row)');
  for (const b of boxes) assert.ok(b.y + b.h <= height);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      // grown by the one clear pixel, two pieces still do not touch
      const apart = a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x || a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y;
      assert.ok(apart, `pieces ${i} and ${j} touch`);
    }
});
