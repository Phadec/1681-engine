import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cursorTip, listPlacement, pixelFit, sheetScaleStyle, splitModeFor, windowStyle } from './placement';

const view = { width: 800, height: 600 };

test('a window is centred in whole pixels, never translated', () => {
  const { fit, style } = windowStyle({ width: 301, height: 201 }, view);
  assert.equal(fit.x, Math.round((800 - 301) / 2));
  assert.equal(fit.y, Math.round((600 - 201) / 2));
  assert.equal(style.transform, undefined);
  assert.equal(style.maxHeight, 201);
});

test('a window taller than the screen is cut and scrolls; one asked to stand off screen is moved back', () => {
  const tall = windowStyle({ width: 300, height: 2000 }, view, { margin: 8 });
  assert.equal(tall.fit.scrollY, true);
  assert.equal(tall.style.maxHeight, 600 - 16);
  const off = windowStyle({ x: 700, y: -50, width: 300, height: 100 }, view, { margin: 8 });
  assert.equal(off.fit.x, 800 - 8 - 300);
  assert.equal(off.fit.y, 8);
});

test('a scaled window is drawn by a transform from its corner and may shrink to minScale', () => {
  const { fit, style } = windowStyle({ width: 300, height: 200 }, view, { scale: 2 });
  assert.equal(fit.scale, 2);
  assert.equal(style.transform, 'scale(2)');
  assert.equal(style.transformOrigin, '0 0');
  const shrunk = windowStyle({ width: 300, height: 400 }, view, { scale: 2, minScale: 1 });
  assert.ok(shrunk.fit.scale < 2 && shrunk.fit.scale >= 1);
});

test('a touch sheet at a smaller window size is laid out bigger and scaled down', () => {
  assert.equal(sheetScaleStyle(1), undefined);
  assert.deepEqual(sheetScaleStyle(0.5), { width: '200%', height: '200%', transform: 'scale(0.5)', transformOrigin: '0 0' });
});

test('a tooltip opens under the cursor and flips over it at the bottom edge', () => {
  const tip = { width: 100, height: 80 };
  const under = cursorTip(100, 100, tip, view);
  assert.equal(under.side, 'below');
  assert.equal(under.y, 112);
  assert.equal(under.x, 118);
  const over = cursorTip(100, 560, tip, view);
  assert.equal(over.side, 'above');
  assert.equal(over.y, 560 - 12 - 80);
  const right = cursorTip(790, 100, tip, view);
  assert.equal(right.x, 800 - 8 - 100);
});

test('a drop-down list opens below, above when short of room, and is cut to the room it has', () => {
  const button = { x: 10, y: 100, width: 80, height: 20 };
  const below = listPlacement(button, { width: 120, height: 200 }, view);
  assert.equal(below.side, 'below');
  assert.equal(below.y, 122);
  assert.equal(below.height, 200);
  const low = { x: 10, y: 500, width: 80, height: 20 };
  const above = listPlacement(low, { width: 120, height: 200 }, view);
  assert.equal(above.side, 'above');
  assert.equal(above.y, 500 - 2 - 200);
  const huge = listPlacement(low, { width: 120, height: 2000 }, view);
  assert.equal(huge.side, 'above');
  assert.equal(huge.height, 500 - 2 - 4);
  assert.equal(huge.y, 4);
});

test('a sprite is shown at a whole multiple, or a whole divisor when too big', () => {
  assert.deepEqual(pixelFit(26, 20, 100, 100), { width: 78, height: 60, scale: 3 });
  assert.deepEqual(pixelFit(26, 20, 100, 100, 2), { width: 52, height: 40, scale: 2 });
  assert.deepEqual(pixelFit(200, 100, 64, 64), { width: 50, height: 25, scale: 0.25 });
  assert.deepEqual(pixelFit(0, 10, 64, 64), { width: 0, height: 0, scale: 1 });
});

test('only a narrow touch screen stacks a split pane', () => {
  assert.equal(splitModeFor(400, true), 'stack');
  assert.equal(splitModeFor(400, false), 'side');
  assert.equal(splitModeFor(700, true), 'side');
  assert.equal(splitModeFor(700, true, 800), 'stack');
});
