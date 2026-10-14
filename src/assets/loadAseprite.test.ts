import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TextureSource, type Texture } from 'pixi.js';
import type { CanvasTexture } from '../core/TextureRegistry.ts';
import { loadAseprite } from './loadAseprite.ts';

const json = {
  frames: {
    'a 0': { frame: { x: 0, y: 0, w: 16, h: 16 }, sourceSize: { w: 16, h: 16 }, duration: 100 },
    'a 1': { frame: { x: 16, y: 0, w: 10, h: 12 }, trimmed: true, spriteSourceSize: { x: 3, y: 4, w: 10, h: 12 }, sourceSize: { w: 16, h: 16 }, duration: 100 },
  },
  meta: { image: '../img/a.png', size: { w: 32, h: 16 }, frameTags: [{ name: 'walk', from: 0, to: 1 }] },
};

/** A sink standing in for the registry: real Pixi textures over a source with no canvas behind it. */
function sink() {
  const added: [string, number, number, number, number][] = [];
  const frames = new Map<string, Texture>();
  const tex = {
    frames,
    source: new TextureSource({ width: 32, height: 16 }),
    add: (name: string, _s: number, x: number, y: number, w: number, h: number) => added.push([name, x, y, w, h]),
  } as unknown as CanvasTexture;
  const keys: string[] = [];
  return { keys, added, frames, sink: { addCanvas: (key: string) => (keys.push(key), tex) } };
}

const fetchFrom = (files: Record<string, unknown>, fetched: string[]) => async (url: string) => {
  fetched.push(url);
  const body = files[url];
  return { ok: body !== undefined, status: body === undefined ? 404 : 200, blob: async () => new Blob(['png']), json: async () => body, text: async () => '' };
};

test('the JSON, then the image beside it, cut into frames named by index', async () => {
  const fetched: string[] = [];
  const s = sink();
  const sheet = await loadAseprite(s.sink, 'hero', 'json/a.json', {
    baseUrl: 'art/',
    fetch: fetchFrom({ 'art/json/a.json': json, 'art/img/a.png': true }, fetched),
    toCanvas: async () => ({ width: 32, height: 16 }) as HTMLCanvasElement,
  });
  assert.deepEqual(fetched, ['art/json/a.json', 'art/img/a.png']);
  assert.deepEqual(s.keys, ['hero']);
  assert.deepEqual(s.added, [['0', 0, 0, 16, 16]]);
  const trimmed = s.frames.get('1')!;
  assert.deepEqual([trimmed.frame.x, trimmed.frame.width, trimmed.orig.width, trimmed.orig.height], [16, 10, 16, 16]);
  assert.deepEqual([trimmed.trim!.x, trimmed.trim!.y], [3, 4], 'the trim keeps the frame where it stood untrimmed');
  assert.deepEqual(sheet.clips.walk!.frames, [0, 1]);
});

test('a missing file names its URL', async () => {
  const s = sink();
  await assert.rejects(loadAseprite(s.sink, 'x', 'a.json', { fetch: fetchFrom({}, []) }), /a\.json answered 404/);
  await assert.rejects(
    loadAseprite(s.sink, 'x', 'a.json', { fetch: fetchFrom({ 'a.json': { ...json, meta: {} } }, []) }),
    /names no sheet image/,
  );
});
