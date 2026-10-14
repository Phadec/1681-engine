import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chevronPixels, discRuns, ellipsePixels, ringPixels } from './aimPixels';

test('a ring is every pixel once, all at its radius, closed round', () => {
  for (const r of [3, 24, 180]) {
    const px = ringPixels(r);
    assert.equal(new Set(px.map(([x, y]) => `${x},${y}`)).size, px.length, `r=${r}: no pixel twice`);
    for (const [x, y] of px) assert.ok(Math.abs(Math.hypot(x, y) - r) < 1, `r=${r}: ${x},${y} off the circle`);
    // 8-connected all the way round: every pixel touches another
    const set = new Set(px.map(([x, y]) => `${x},${y}`));
    for (const [x, y] of px) {
      let n = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && set.has(`${x + dx},${y + dy}`)) n++;
      assert.ok(n >= 2, `r=${r}: ${x},${y} is loose`);
    }
  }
});

test('a disc is one run per row, widest in the middle, as wide as it is tall', () => {
  const runs = discRuns(10);
  assert.equal(runs.length, 21);
  const mid = runs.find(([y]) => y === 0)!;
  assert.deepEqual(mid, [0, -10, 10]);
  for (const [, x0, x1] of runs) assert.ok(x0 <= x1 && x0 === -x1);
});

test('a ground ellipse is closed, each pixel once, as wide and as deep as asked', () => {
  for (const [rx, ry] of [[10, 5], [24, 12], [7, 3]] as const) {
    const px = ellipsePixels(rx, ry);
    const set = new Set(px.map(([x, y]) => `${x},${y}`));
    assert.equal(set.size, px.length);
    assert.equal(Math.max(...px.map(([x]) => x)), rx);
    assert.equal(Math.max(...px.map(([, y]) => y)), ry);
    for (const [x, y] of px) {
      let n = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && set.has(`${x + dx},${y + dy}`)) n++;
      assert.ok(n >= 2, `${rx}x${ry}: ${x},${y} is loose`);
    }
  }
});

test('a chevron points the way it is told: its tip is the lit pixel furthest along the angle', () => {
  for (const deg of [0, 20, 90, 135, 250]) {
    const a = (deg * Math.PI) / 180;
    const { lit, rim } = chevronPixels(a, 4);
    assert.ok(lit.length > 6 && rim.length > lit.length);
    const along = lit.map(([x, y]) => x * Math.cos(a) + y * Math.sin(a));
    assert.ok(Math.max(...along) > 1 && Math.min(...along) < -1, `${deg}°`);
  }
});
