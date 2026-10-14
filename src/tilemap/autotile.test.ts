import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BLOB47_MASKS,
  BLOB_E,
  BLOB_N,
  BLOB_NE,
  BLOB_S,
  BLOB_W,
  EDGE_E,
  EDGE_N,
  EDGE_S,
  EDGE_W,
  autotile,
  blob47Index,
  blobMask,
  edgeMask,
  paintTerrain,
  reduceBlobMask,
  updateAutotile,
  type AutotileRuleSet,
  type TerrainGrid,
} from './autotile.ts';

/** A grid from rows of digits. */
function grid(...rows: string[]): TerrainGrid {
  return { width: rows[0]!.length, height: rows.length, cells: Uint8Array.from(rows.join(''), (c) => Number(c)) };
}

test('the blob set has 47 masks, and a corner counts only between two matching sides', () => {
  assert.equal(BLOB47_MASKS.length, 47);
  assert.equal(BLOB47_MASKS[0], 0);
  assert.equal(BLOB47_MASKS.at(-1), 255);
  assert.equal(reduceBlobMask(BLOB_NE), 0);
  assert.equal(reduceBlobMask(BLOB_NE | BLOB_N), BLOB_N);
  assert.equal(reduceBlobMask(BLOB_NE | BLOB_N | BLOB_E), BLOB_NE | BLOB_N | BLOB_E);
  assert.equal(blob47Index(255), 46);
  assert.equal(blob47Index(BLOB_NE), 0, 'an unreduced mask is reduced first');
  for (let m = 0; m < 256; m++) assert.ok(blob47Index(m) >= 0 && blob47Index(m) < 47);
});

test('edge masks read the four sides; outside the grid joins by default', () => {
  const g = grid('000', '010', '011');
  assert.equal(edgeMask(g, 1, 1), EDGE_S);
  assert.equal(edgeMask(g, 2, 2), EDGE_W | EDGE_S | EDGE_E, 'the border joins');
  assert.equal(edgeMask(g, 2, 2, { edge: 'other' }), EDGE_W);
  assert.equal(edgeMask(g, 0, 0, { edge: 'other' }), EDGE_E | EDGE_S);
  assert.equal(edgeMask(g, 1, 1, { joins: () => true }), EDGE_N | EDGE_E | EDGE_S | EDGE_W);
});

test('blob masks keep a corner only when both sides beside it join', () => {
  const g = grid('11', '11');
  assert.equal(blobMask(g, 0, 0, { edge: 'other' }), BLOB_E | BLOB_S | (1 << 3)); // SE corner joins
  const h = grid('010', '111', '010');
  assert.equal(blobMask(h, 1, 1, { edge: 'other' }), BLOB_N | BLOB_E | BLOB_S | BLOB_W, 'a cross has no corners');
});

const RULES: AutotileRuleSet = {
  edge: 'other',
  empty: 99,
  rules: [
    { terrain: 1, mode: 'edges', tiles: (m) => 10 + m },
    { terrain: 2, tiles: { 0: 50, 255: [60, 61] }, fallback: 70 },
  ],
};

test('a rule set turns terrain into tiles: functions, tables, variants, fallbacks and the empty tile', () => {
  const g = grid('110', '022', '022');
  const tiles = autotile(g, RULES);
  assert.equal(tiles[0], 10 + EDGE_E);
  assert.equal(tiles[1], 10 + EDGE_W);
  assert.equal(tiles[2], 99, 'terrain 0 has no rule');
  assert.equal(tiles[4], 70, 'a mask missing from the table falls back');
  const lone = autotile(grid('2'), RULES);
  assert.equal(lone[0], 50);
  const full = autotile(grid('222', '222', '222'), { ...RULES, edge: 'same' });
  assert.ok(full.every((t) => t === 60 || t === 61));
  assert.deepEqual(full, autotile(grid('222', '222', '222'), { ...RULES, edge: 'same' }), 'variants are the same every time');
});

test('without a fallback a missing mask takes the full tile', () => {
  const set: AutotileRuleSet = { rules: [{ terrain: 1, tiles: { 255: 7 } }], edge: 'other' };
  assert.equal(autotile(grid('1'), set)[0], 7);
});

test('connectsTo joins other terrain as if it were the same', () => {
  const set: AutotileRuleSet = { edge: 'other', rules: [{ terrain: 1, mode: 'edges', tiles: (m) => m, connectsTo: [3] }, { terrain: 3, mode: 'edges', tiles: (m) => 100 + m }] };
  const t = autotile(grid('13'), set);
  assert.equal(t[0], EDGE_E);
  assert.equal(t[1], 100, 'the link is one way: 3 does not join 1');
});

test('painting one cell retiles exactly what a full pass would, and says which cells changed', () => {
  const g = grid('0000', '0110', '0110', '0000');
  const set: AutotileRuleSet = { edge: 'other', rules: [{ terrain: 1, tiles: (m) => 1000 + m }, { terrain: 0, mode: 'edges', tiles: (m) => m }] };
  const out = autotile(g, set);
  const changed = paintTerrain(g, set, out, 3, 1, 1);
  assert.deepEqual(out, autotile(g, set));
  assert.ok(changed.includes(1 * 4 + 3) && changed.includes(1 * 4 + 2));
  assert.ok(changed.every((i) => Math.abs((i % 4) - 3) <= 1 && Math.abs(Math.floor(i / 4) - 1) <= 1));
  assert.deepEqual(updateAutotile(g, set, out, 3, 1), [], 'nothing left to change');
  assert.deepEqual(paintTerrain(g, set, out, 9, 9, 1), [], 'off the grid does nothing');
});
