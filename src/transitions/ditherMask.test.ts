import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAYER4, DITHER_LEVELS, ditherCovered, wipeLevel } from './ditherMask.ts';

test('the matrix holds every threshold once', () => {
  assert.deepEqual([...BAYER4].sort((a, b) => a - b), [...Array(16).keys()]);
});

test('each level covers exactly that many cells of a tile, and a level keeps the cells of the one below', () => {
  for (let level = 0; level <= DITHER_LEVELS; level++) {
    let n = 0;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        if (ditherCovered(level, x, y)) n++;
        if (level > 0 && ditherCovered(level - 1, x, y)) assert.ok(ditherCovered(level, x, y));
      }
    assert.equal(n, level);
  }
  // the pattern tiles: (x + 4, y + 4) is the same cell
  assert.equal(ditherCovered(5, 1, 2), ditherCovered(5, 9, 6));
});

test('a wipe starts empty, ends solid and sweeps from the near side', () => {
  for (const u of [0, 0.3, 1]) {
    assert.equal(wipeLevel(0, u, 0.3), 0);
    assert.equal(wipeLevel(1, u, 0.3), 16);
  }
  const near = wipeLevel(0.4, 0.1, 0.3);
  const far = wipeLevel(0.4, 0.9, 0.3);
  assert.ok(near > far, `${near} > ${far}`);
  // levels never go back down as the wipe runs on
  let last = 0;
  for (let p = 0; p <= 1; p += 0.05) {
    const l = wipeLevel(p, 0.5, 0.3);
    assert.ok(l >= last);
    last = l;
  }
});
