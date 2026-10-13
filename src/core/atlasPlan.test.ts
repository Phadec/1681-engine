import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ATLAS_PAD, atlasPageLimit, planAtlas, type AtlasSize } from './atlasPlan';

test('page limit: 8192 where the GPU takes it or cannot be asked, 4096 below that, smaller GPUs their own', () => {
  assert.equal(atlasPageLimit(16384), 8192);
  assert.equal(atlasPageLimit(8192), 8192);
  assert.equal(atlasPageLimit(null), 8192);
  assert.equal(atlasPageLimit(4096), 4096);
  assert.equal(atlasPageLimit(6000), 4096);
  assert.equal(atlasPageLimit(2048), 2048);
  assert.equal(atlasPageLimit(3000), 2048);
});

/** The single-page shelf packer the atlas used before pages existed, as the reference. */
function legacy(sizes: AtlasSize[]) {
  const sorted = sizes.map((s, i) => ({ ...s, i })).sort((a, b) => b.h - a.h);
  const area = sorted.reduce((sum, s) => sum + (s.w + ATLAS_PAD) * (s.h + ATLAS_PAD), 0);
  const widest = Math.max(1, ...sorted.map((s) => s.w + ATLAS_PAD));
  const width = Math.max(1024, 2 ** Math.ceil(Math.log2(Math.max(widest, Math.sqrt(area)))));
  let x = 0;
  let y = 0;
  let shelf = 0;
  const at: { x: number; y: number }[] = [];
  for (const s of sorted) {
    const w = s.w + ATLAS_PAD;
    if (x + w > width) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    at[s.i] = { x, y };
    x += w;
    shelf = Math.max(shelf, s.h + ATLAS_PAD);
  }
  return { width, height: y + shelf, at };
}

const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

function sample(n: number, seed: number): AtlasSize[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({ w: 8 + Math.floor(r() * 300), h: 8 + Math.floor(r() * 200) }));
}

test('everything under the limit packs exactly as the one-page atlas always did (the desktop is unchanged)', () => {
  const sizes = sample(400, 7);
  const plan = planAtlas(sizes, 8192);
  const old = legacy(sizes);
  assert.equal(plan.pages.length, 1);
  assert.deepEqual(plan.pages[0], { width: old.width, height: old.height });
  sizes.forEach((_, i) => assert.deepEqual(plan.places[i], { page: 0, ...old.at[i] }));
});

test('past the limit the images spill onto further pages, none overlapping and none past the limit', () => {
  const sizes = sample(1500, 11);
  const limit = 2048;
  const plan = planAtlas(sizes, limit);
  assert.ok(plan.pages.length > 1);
  for (const p of plan.pages) assert.ok(p.width <= limit && p.height <= limit, JSON.stringify(p));
  const byPage = new Map<number, { x: number; y: number; w: number; h: number }[]>();
  sizes.forEach((s, i) => {
    const at = plan.places[i]!;
    const page = plan.pages[at.page]!;
    assert.ok(at.x + s.w <= page.width && at.y + s.h <= page.height, `image ${i} inside its page`);
    const list = byPage.get(at.page) ?? [];
    for (const o of list) assert.ok(at.x >= o.x + o.w || o.x >= at.x + s.w || at.y >= o.y + o.h || o.y >= at.y + s.h, `image ${i} overlaps`);
    list.push({ x: at.x, y: at.y, w: s.w, h: s.h });
    byPage.set(at.page, list);
  });
});

test('an empty atlas has no pages; one image bigger than the limit gets its own page', () => {
  assert.deepEqual(planAtlas([], 4096), { pages: [], places: [] });
  const plan = planAtlas([{ w: 10, h: 10 }, { w: 5000, h: 20 }, { w: 12, h: 12 }], 4096);
  const big = plan.places[1]!;
  assert.equal(plan.pages[big.page]!.width >= 5000 + ATLAS_PAD, true);
});
