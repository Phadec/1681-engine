import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstFocus, linearFocus, nextFocus } from './focusNav';

// a 3 × 2 grid of 10-px buttons, 20 px apart, listed out of reading order
const grid = [
  { x: 20, y: 0, width: 10, height: 10 }, // 0: top middle
  { x: 0, y: 0, width: 10, height: 10 }, // 1: top left
  { x: 40, y: 0, width: 10, height: 10 }, // 2: top right
  { x: 0, y: 20, width: 10, height: 10 }, // 3: bottom left
  { x: 20, y: 20, width: 10, height: 10 }, // 4: bottom middle
  { x: 40, y: 20, width: 10, height: 10 }, // 5: bottom right
];

test('the first focus is the top-left item', () => {
  assert.equal(firstFocus(grid), 1);
  assert.equal(nextFocus(grid, -1, 'down'), 1);
  assert.equal(firstFocus([]), -1);
});

test('directions move to the nearest item that way, straight ahead first', () => {
  assert.equal(nextFocus(grid, 1, 'right'), 0);
  assert.equal(nextFocus(grid, 0, 'right'), 2);
  assert.equal(nextFocus(grid, 0, 'down'), 4);
  assert.equal(nextFocus(grid, 5, 'left'), 4);
  assert.equal(nextFocus(grid, 4, 'up'), 0);
});

test('an edge stays put, or wraps round to the far side on the same line', () => {
  assert.equal(nextFocus(grid, 2, 'right'), 2);
  assert.equal(nextFocus(grid, 2, 'right', true), 1);
  assert.equal(nextFocus(grid, 3, 'down', true), 1);
});

test('a near item off to the side loses to one straight ahead', () => {
  const rects = [
    { x: 0, y: 0, width: 10, height: 10 },
    { x: 15, y: 30, width: 10, height: 10 }, // nearer, but well below
    { x: 40, y: 0, width: 10, height: 10 }, // farther, straight across
  ];
  assert.equal(nextFocus(rects, 0, 'right'), 2);
});

test('tab order wraps both ways', () => {
  assert.equal(linearFocus(3, 2, 1), 0);
  assert.equal(linearFocus(3, 0, -1), 2);
  assert.equal(linearFocus(3, -1, 1), 0);
  assert.equal(linearFocus(3, -1, -1), 2);
  assert.equal(linearFocus(0, 0, 1), -1);
});
