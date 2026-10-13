import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AssetLoader, resolveUrl, type AssetLoaderOptions } from './AssetLoader.ts';

test('relative urls resolve beside the file that names them', () => {
  assert.equal(resolveUrl('tiles.png', 'maps/level.tmj'), 'maps/tiles.png');
  assert.equal(resolveUrl('../art/tiles.png', 'maps/level.tmj'), 'art/tiles.png');
  assert.equal(resolveUrl('./a.png', 'x/y.json'), 'x/a.png');
  assert.equal(resolveUrl('/abs.png', 'maps/level.tmj'), '/abs.png');
  assert.equal(resolveUrl('https://cdn.example/a.png', 'maps/level.tmj'), 'https://cdn.example/a.png');
  assert.equal(resolveUrl('a.png', ''), 'a.png');
});

/** A fetch over an in-memory set of files, and a sink that records what became a texture. */
function fakes(files: Record<string, unknown>) {
  const fetched: string[] = [];
  const textures: string[] = [];
  const options: AssetLoaderOptions = {
    fetch: async (url) => {
      fetched.push(url);
      const body = files[url];
      return {
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
        blob: async () => new Blob([String(url)]),
        json: async () => body,
        text: async () => String(body),
      };
    },
    toCanvas: async () => ({ width: 64, height: 16 }) as HTMLCanvasElement,
  };
  const sink = { addCanvas: (key: string) => textures.push(key), addSpriteSheet: (key: string) => textures.push(`${key}#sheet`) };
  return { options, sink, fetched, textures };
}

const map = {
  width: 1,
  height: 1,
  tilewidth: 16,
  tileheight: 16,
  layers: [{ type: 'tilelayer', name: 'g', data: [1] }],
  tilesets: [{ firstgid: 1, name: 'tiles', image: '../art/tiles.png', imagewidth: 16, imageheight: 16, tilewidth: 16, tileheight: 16, columns: 1, tilecount: 1 }],
};

test('a tilemap brings its tileset images with it, and progress counts them', async () => {
  const f = fakes({ 'maps/level.tmj': map, 'art/tiles.png': 'png', 'hero.png': 'png', 'cfg.json': { speed: 3 } });
  const loader = new AssetLoader(f.sink, f.options);
  loader.tilemap('level', 'maps/level.tmj').spritesheet('hero', 'hero.png', { frameWidth: 16, frameHeight: 16 }).json('cfg', 'cfg.json');
  const progress: string[] = [];
  await loader.load((p) => progress.push(`${p.done}/${p.total}`));
  assert.deepEqual(f.textures.sort(), ['hero#sheet', 'tiles']);
  assert.equal(loader.map('level').width, 1);
  assert.deepEqual(loader.getJson('cfg'), { speed: 3 });
  assert.equal(progress.length, 4);
  assert.equal(progress.at(-1), '4/4');
  assert.ok(f.fetched.includes('art/tiles.png'));
});

test('a missing file fails the load naming its url', async () => {
  const f = fakes({});
  const loader = new AssetLoader(f.sink, { ...f.options, baseUrl: 'assets/' });
  loader.image('x', 'nope.png');
  await assert.rejects(loader.load(), /assets\/nope\.png answered 404/);
});

test('asking for what was never loaded says so', () => {
  const f = fakes({});
  const loader = new AssetLoader(f.sink, f.options);
  assert.throws(() => loader.map('level'), /no tilemap loaded as "level"/);
  assert.throws(() => loader.getJson('cfg'), /no JSON or text loaded as "cfg"/);
});

test('no more than `concurrency` requests run at once', async () => {
  let running = 0;
  let peak = 0;
  const files: Record<string, unknown> = {};
  for (let i = 0; i < 20; i++) files[`f${i}.json`] = i;
  const loader = new AssetLoader(
    { addCanvas() {}, addSpriteSheet() {} },
    {
      concurrency: 3,
      fetch: async (url) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 2));
        running--;
        return { ok: true, status: 200, blob: async () => new Blob(), json: async () => files[url], text: async () => '' };
      },
    },
  );
  for (let i = 0; i < 20; i++) loader.json(`k${i}`, `f${i}.json`);
  await loader.load();
  assert.equal(peak, 3);
  assert.equal(loader.getJson('k19'), 19);
});
