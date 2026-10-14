import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anchorPosition } from './anchor';
import { fitToViewport } from './fitToViewport';
import { snapRect } from './geometry';
import { listWidth } from './listWidth';
import { placeTooltip } from './placeTooltip';
import { quantize, sliderValueAt } from './slider';
import { stackLayout } from './stack';
import { wrapRow } from './wrapRow';

test('a vertical stack lays items down with gap and padding and takes their size', () => {
  const r = stackLayout([{ width: 10, height: 5 }, { width: 20, height: 7 }], { gap: 2, padding: 3 });
  assert.deepEqual(r.items, [
    { x: 3, y: 3, width: 10, height: 5 },
    { x: 3, y: 10, width: 20, height: 7 },
  ]);
  assert.equal(r.width, 26);
  assert.equal(r.height, 20);
});

test('a horizontal stack centres, ends and stretches across', () => {
  const sizes = [{ width: 4, height: 10 }, { width: 4, height: 4 }];
  assert.equal(stackLayout(sizes, { direction: 'horizontal', align: 'center' }).items[1]!.y, 3);
  assert.equal(stackLayout(sizes, { direction: 'horizontal', align: 'end' }).items[1]!.y, 6);
  assert.equal(stackLayout(sizes, { direction: 'horizontal', align: 'stretch' }).items[1]!.height, 10);
  assert.equal(stackLayout(sizes, { direction: 'horizontal', gap: 1 }).width, 9);
});

test('snapping lands a stack on whole pixels', () => {
  const r = stackLayout([{ width: 3, height: 2.5 }, { width: 5, height: 2.5 }], { align: 'center', snap: true });
  for (const it of r.items) for (const v of [it.x, it.y, it.width, it.height]) assert.ok(Number.isInteger(v));
});

test('snapRect keeps touching neighbours touching', () => {
  const a = snapRect({ x: 0.4, y: 0, width: 10.3, height: 1 });
  const b = snapRect({ x: 10.7, y: 0, width: 5, height: 1 });
  assert.equal(a.x + a.width, b.x);
});

test('anchors pin a box to corners, edges and the centre, inside per-side margins', () => {
  const size = { width: 20, height: 10 };
  const view = { width: 200, height: 100 };
  assert.deepEqual(anchorPosition('top-left', size, view, 8), { x: 8, y: 8 });
  assert.deepEqual(anchorPosition('bottom-right', size, view, 8), { x: 172, y: 82 });
  assert.deepEqual(anchorPosition('center', size, view, 8), { x: 90, y: 45 });
  assert.deepEqual(anchorPosition('bottom', size, view, { bottom: 20 }), { x: 90, y: 70 });
  assert.deepEqual(anchorPosition('center', { width: 21, height: 11 }, view, 0, true), { x: 90, y: 45 });
});

test('fitToViewport keeps a window that fits as it is, moved inside the edges', () => {
  const f = fitToViewport({ x: 190, y: -5, width: 50, height: 40 }, { width: 200, height: 100 });
  assert.deepEqual([f.x, f.y, f.width, f.height, f.scale, f.scrollX, f.scrollY], [142, 8, 50, 40, 1, false, false]);
});

test('fitToViewport scrolls instead of shrinking by default, and shrinks down to minScale when allowed', () => {
  const view = { width: 200, height: 100 };
  const scroll = fitToViewport({ width: 100, height: 300 }, view, { centre: true });
  assert.equal(scroll.scale, 1);
  assert.equal(scroll.height, 84);
  assert.ok(scroll.scrollY && !scroll.scrollX);
  assert.equal(scroll.y, 8);
  const shrink = fitToViewport({ width: 100, height: 168 }, view, { minScale: 0.25 });
  assert.equal(shrink.scale, 0.5);
  assert.equal(shrink.height, 168);
  assert.ok(!shrink.scrollY);
});

test('fitToViewport honours a window scale: laid out on a box 1/scale the screen', () => {
  const f = fitToViewport({ width: 300, height: 100 }, { width: 400, height: 300 }, { scale: 0.5, margin: 0, centre: true });
  assert.equal(f.scale, 0.5);
  assert.equal(f.width, 300);
  assert.deepEqual([f.x, f.y], [125, 125]);
  const big = fitToViewport({ width: 300, height: 100 }, { width: 400, height: 300 }, { scale: 2, margin: 0 });
  assert.equal(big.scale, 2);
  assert.equal(big.width, 200);
  assert.ok(big.scrollX);
});

test('a tooltip goes below, flips above at the bottom edge and slides inside the sides', () => {
  const view = { width: 200, height: 100 };
  const tip = { width: 60, height: 30 };
  assert.deepEqual(placeTooltip({ x: 10, y: 10, width: 20, height: 10 }, tip, view), { x: 10, y: 24, side: 'below' });
  const flipped = placeTooltip({ x: 170, y: 80, width: 20, height: 10 }, tip, view);
  assert.equal(flipped.side, 'above');
  assert.equal(flipped.y, 46);
  assert.equal(flipped.x, 136);
  const right = placeTooltip({ x: 180, y: 40, width: 10, height: 10 }, tip, view, { side: 'right' });
  assert.equal(right.side, 'left');
  assert.equal(right.x, 116);
});

test('a tooltip with room on neither side takes the roomier one', () => {
  const p = placeTooltip({ x: 0, y: 30, width: 10, height: 10 }, { width: 10, height: 50 }, { width: 100, height: 60 });
  assert.equal(p.side, 'above');
  assert.equal(p.y, 4);
});

test('wrapRow breaks a row into lines, an oversized item on a line of its own', () => {
  assert.deepEqual(wrapRow([30, 30, 30, 30], 100, 4), [[0, 1, 2], [3]]);
  assert.deepEqual(wrapRow([30, 150, 30], 100, 0), [[0], [1], [2]]);
  assert.deepEqual(wrapRow([], 100), []);
});

test('listWidth fits the longest label, rounded up and held to its bounds', () => {
  const measure = (s: string) => s.length * 5.5;
  assert.equal(listWidth(['a', 'abc'], measure, { padding: 4 }), 21);
  assert.equal(listWidth(['a'], measure, { min: 40 }), 40);
  assert.equal(listWidth(['aaaaaaaaaaaaaaaaaaaa'], measure, { max: 50 }), 50);
});

test('a slider quantizes to its steps and reads the pointer along its track', () => {
  assert.equal(quantize(0.37, 0, 1, 0.25), 0.25);
  assert.equal(quantize(0.38, 0, 1, 0.25), 0.5);
  assert.equal(quantize(9.9, 0, 10, 3), 9);
  assert.equal(sliderValueAt(60, 10, 100, 0, 10, 1), 5);
  assert.equal(sliderValueAt(-50, 10, 100, 0, 10), 0);
  assert.equal(sliderValueAt(500, 10, 100, 0, 10), 10);
});
