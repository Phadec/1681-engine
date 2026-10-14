import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hex } from './pixel';
import { FRAME_CORNERS, frameSvg, nineSlice } from './nineSlice';

const PAL = { K: '#000000', H: '#ffffff', L: '#404040', M: '#808080', F: '#202020' };

test('a frame is the corner mirrored, its far side in the twin, with insets for its slices', () => {
  const { grid, insets } = nineSlice({ corner: FRAME_CORNERS.button, palette: PAL });
  assert.equal(grid.w, 11);
  assert.equal(grid.h, 11);
  assert.deepEqual(insets, { top: 5, left: 5, right: 5, bottom: 5 });
  // the notch stays empty in all four corners
  for (const [x, y] of [[0, 0], [10, 0], [0, 10], [10, 10]] as const) assert.equal(grid.alphaAt(x, y), 0);
  // lit on the top and left, dark (the twin) on the bottom and right
  assert.equal(grid.get(5, 1), hex('#ffffff'));
  assert.equal(grid.get(1, 5), hex('#ffffff'));
  assert.equal(grid.get(5, 9), hex('#404040'));
  assert.equal(grid.get(9, 5), hex('#404040'));
  // M has no twin in this palette: kept on the far side
  assert.equal(grid.get(5, 8), hex('#808080'));
  assert.equal(grid.get(5, 5), hex('#202020'));
});

test('a shadow and an offset widen the canvas and the far insets', () => {
  const up = nineSlice({ corner: FRAME_CORNERS.button, palette: { ...PAL, Z: '#00000080' }, shadow: [0, 1] });
  assert.equal(up.grid.h, 12);
  assert.deepEqual(up.insets, { top: 5, left: 5, right: 5, bottom: 6 });
  assert.equal(up.grid.get(5, 11), hex('#00000080'));
  const pressed = nineSlice({ corner: FRAME_CORNERS.button, palette: PAL, offset: [0, 1], pad: [0, 1] });
  assert.equal(pressed.grid.alphaAt(5, 0), 0);
  assert.equal(pressed.grid.get(5, 1), hex('#000000'));
});

test('an overlay paints over it, and a ragged corner is refused', () => {
  const tick = Array.from({ length: 7 }, (_, y) => (y === 3 ? '...T...' : '.......'));
  const box = nineSlice({ corner: ['.KK', 'KHH', 'KHF'], palette: { ...PAL, T: '#ff0000' }, overlay: tick });
  assert.equal(box.grid.get(3, 3), hex('#ff0000'));
  assert.throws(() => nineSlice({ corner: ['.K', 'KHH'], palette: PAL }));
});

test('the SVG merges runs and keeps see-through fills', () => {
  const { grid } = nineSlice({ corner: FRAME_CORNERS.thin, palette: { K: '#000000', H: '#ffffff', F: '#10203080' } });
  const svg = frameSvg(grid, 2);
  assert.ok(svg.startsWith('<svg') && svg.includes('width="14"'));
  assert.ok(svg.includes('fill="#102030" fill-opacity="0.502"'));
  // the top row's ink is one run: x 1..5
  assert.ok(svg.includes('<rect x="2" y="0" width="10" height="2" fill="#000000"/>'));
});
