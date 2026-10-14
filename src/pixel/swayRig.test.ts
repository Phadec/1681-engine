import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRig, complement, gustAt, swayOffset, tileHash, trunkPivot, type Rect, type SwayDef } from './swayRig';

/** Row widths of a conifer's frame (24x58): crown rows 4..50, trunk 51..57. */
const PINE = [0, 0, 0, 0, 2, 4, 4, 4, 4, 6, 6, 6, 6, 8, 8, 8, 10, 10, 11, 9, 8, 8, 10, 10, 12, 12, 14, 14, 13, 15, 13, 12, 12, 14, 14, 16, 18, 18, 20, 21, 19, 14, 14, 16, 18, 20, 20, 22, 24, 24, 23, 6, 6, 6, 6, 6, 6, 4];
/** A broadleaf (48x64): the trunk runs 46..59 and flares into roots under it. */
const TREE = [0, 8, 10, 13, 15, 17, 18, 19, 19, 21, 22, 24, 25, 27, 27, 27, 28, 30, 34, 36, 38, 40, 41, 43, 43, 44, 44, 44, 44, 44, 44, 44, 42, 42, 40, 38, 36, 34, 30, 29, 27, 26, 24, 22, 18, 12, 10, 9, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 10, 12, 12, 10, 0];

test('the trunk is found in the pixels, root flare and all', () => {
  assert.equal(trunkPivot(PINE), 51);
  assert.equal(trunkPivot(TREE), 46);
  // a bush has no trunk
  assert.equal(trunkPivot([6, 8, 10, 12, 14, 16, 17, 18, 18, 18, 18, 18, 16, 14, 12]), null);
});

function coversOnce(w: number, h: number, rects: Rect[]): boolean {
  const seen = new Uint8Array(w * h);
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x >= 0 && x < w && y >= 0 && y < h) seen[y * w + x]!++;
  return seen.every((n) => n === 1);
}

const DEFS: Record<string, SwayDef> = {
  crown: { mode: 'crown', amp: 2, speed: 0.3 },
  top: { mode: 'top', top: 0.4, amp: 1, speed: 0.5 },
  hang: { mode: 'hang', cloth: [4, 6, 18, 40], amp: 2, speed: 0.6 },
  tufts: { mode: 'tufts', tufts: { '*': [[0, 20, 4, 34], [32, 18, 40, 34, 0.5]] }, amp: 1, speed: 0.8 },
};

test('pieces and strips cover the frame exactly once', () => {
  for (const [name, def] of Object.entries(DEFS)) {
    const w = def.mode === 'tufts' ? 40 : 24;
    const h = def.mode === 'tufts' ? 34 : 58;
    const rig = buildRig(def, w, h, def.mode === 'crown' ? PINE : undefined);
    assert.ok(coversOnce(w, h, [...rig.pieces, ...rig.strips.map((s) => s.rect)]), `${name}: every pixel in exactly one rect`);
    assert.ok(rig.strips.length > 0 && rig.pieces.length > 0, name);
  }
});

test('a tufted sprite moves only its tufts, the biggest still piece first; a variant without any does not sway', () => {
  const def: SwayDef = { mode: 'tufts', tufts: { '2': [[0, 20, 4, 34], [32, 18, 40, 34]] }, amp: 1, speed: 1 };
  const rig = buildRig(def, 40, 34, undefined, 2);
  assert.equal(rig.strips.length, 2);
  for (const s of rig.strips) assert.ok(s.rect.x + s.rect.w <= 4 || s.rect.x >= 32);
  assert.ok(rig.pieces.every((p) => p.w * p.h <= rig.pieces[0]!.w * rig.pieces[0]!.h));
  const none = buildRig(def, 40, 34, undefined, 0);
  assert.equal(none.strips.length, 0);
  assert.equal(none.pieces.length, 0);
});

test('the complement of non-overlapping holes tiles the rest of the frame', () => {
  const holes: Rect[] = [
    { x: 0, y: 3, w: 4, h: 5 },
    { x: 10, y: 0, w: 3, h: 12 },
    { x: 5, y: 6, w: 2, h: 2 },
  ];
  assert.ok(coversOnce(16, 12, [...holes, ...complement(16, 12, holes)]));
});

test('the sway moves in whole pixels, stays inside its reach, and is still with no wind', () => {
  for (let t = 0; t < 60; t += 0.05) {
    const off = swayOffset(t, 0.3, tileHash(3, 9), 0, 2.1, 1, gustAt(t, 400, 11, 448), 1);
    assert.ok(Number.isInteger(off));
    assert.ok(Math.abs(off) <= 3);
  }
  assert.equal(swayOffset(12, 0.3, 0.2, 0, 1.6, 0, 1, 1), 0);
});

test('a faint breeze with a floor still ticks one whole pixel, and never more', () => {
  const seen = new Set<number>();
  for (let t = 0; t < 10; t += 1 / 60) seen.add(swayOffset(t, 0.3, 0.1, 0, 1, 0.3, gustAt(t, 0, 11, 448), 1, 1));
  assert.ok(seen.has(1) || seen.has(-1), 'it moves');
  for (const v of seen) assert.ok(Math.abs(v) <= 1);
});
