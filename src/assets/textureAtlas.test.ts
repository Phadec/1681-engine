import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectAtlasPages, duplicateFrames, parseAtlas, type PackedAtlasPage } from './textureAtlas.ts';
import { resolveUrl } from './AssetLoader.ts';

const hash = {
  frames: {
    'hero_0.png': { frame: { x: 2, y: 2, w: 20, h: 24 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 20, h: 24 }, sourceSize: { w: 20, h: 24 } },
    'hero_1.png': { frame: { x: 24, y: 2, w: 18, h: 22 }, rotated: true, trimmed: true, spriteSourceSize: { x: 1, y: 2, w: 18, h: 22 }, sourceSize: { w: 20, h: 24 }, pivot: { x: 0.5, y: 1 } },
  },
  animations: { walk: ['hero_0.png', 'hero_1.png'] },
  meta: { image: 'hero-0.png', scale: '1', related_multi_packs: ['hero-1.json'] },
};

test('a hash atlas parses frames, trims, turns and animations', () => {
  const page = parseAtlas(hash, 'hero-0.json');
  assert.equal(page.image, 'hero-0.png');
  assert.deepEqual(page.related, ['hero-1.json']);
  assert.deepEqual(page.animations, { walk: ['hero_0.png', 'hero_1.png'] });
  assert.equal(page.scale, 1);
  const [a, b] = page.frames;
  assert.deepEqual(a, { name: 'hero_0.png', x: 2, y: 2, w: 20, h: 24, rotated: false, sourceW: 20, sourceH: 24 });
  // turned on the page: 22 wide, 18 tall there; untrimmed size and trim offset kept
  assert.deepEqual(b, {
    name: 'hero_1.png', x: 24, y: 2, w: 22, h: 18, rotated: true, sourceW: 20, sourceH: 24,
    trim: { x: 1, y: 2, w: 18, h: 22 }, anchor: { x: 0.5, y: 1 },
  });
});

test('an array atlas names frames by filename', () => {
  const page = parseAtlas({ frames: [{ filename: 'a', frame: { x: 0, y: 0, w: 4, h: 4 } }, { frame: { x: 4, y: 0, w: 4, h: 4 } }], meta: { image: 'p.png' } });
  assert.deepEqual(page.frames.map((f) => f.name), ['a', '1']);
  assert.deepEqual(page.related, []);
});

test('a file that is not an atlas fails naming where it came from', () => {
  assert.throws(() => parseAtlas({ hello: 1 }, 'x.json'), /x\.json: not a TexturePacker/);
  assert.throws(() => parseAtlas({ frames: {} , meta: {} }, 'y.json'), /y\.json: no "meta.image"/);
  assert.throws(() => parseAtlas({ frames: { f: { frame: { x: 0 } } }, meta: { image: 'i.png' } }, 'z.json'), /frame "f" has no frame rect/);
});

test('a multipack is followed once per page however the pages name each other', async () => {
  const files: Record<string, unknown> = {
    'art/hero-0.json': hash,
    'art/hero-1.json': { frames: { 'hero_2.png': { frame: { x: 0, y: 0, w: 8, h: 8 } } }, meta: { image: 'hero-1.png', related_multi_packs: ['hero-0.json', 'hero-2.json'] } },
    'art/hero-2.json': { frames: { 'hero_3.png': { frame: { x: 0, y: 0, w: 8, h: 8 } } }, meta: { image: 'hero-2.png', related_multi_packs: ['hero-0.json', 'hero-1.json'] } },
  };
  const loaded: string[] = [];
  const pages = await collectAtlasPages('art/hero-0.json', async (u) => {
    loaded.push(u);
    return parseAtlas(files[u], u);
  }, resolveUrl);
  assert.deepEqual(loaded, ['art/hero-0.json', 'art/hero-1.json', 'art/hero-2.json']);
  assert.deepEqual(pages.flatMap((p) => p.page.frames.map((f) => f.name)), ['hero_0.png', 'hero_1.png', 'hero_2.png', 'hero_3.png']);
});

test('frames named on two pages are reported', () => {
  const p = (names: string[]): PackedAtlasPage => ({ image: 'i', frames: names.map((name) => ({ name, x: 0, y: 0, w: 1, h: 1, rotated: false, sourceW: 1, sourceH: 1 })), animations: {}, related: [], scale: 1 });
  assert.deepEqual(duplicateFrames([p(['a', 'b']), p(['b', 'c'])]), ['b']);
});
