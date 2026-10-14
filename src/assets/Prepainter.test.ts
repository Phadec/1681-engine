import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type PaintedPixels, Prepainter, type PrepainterTextures } from './Prepainter';
import { workerPainter } from './workerPainter';

function registry(): PrepainterTextures & { keys: Set<string> } {
  const keys = new Set<string>();
  return { keys, exists: (k) => keys.has(k), remove: (k) => void keys.delete(k), addCanvas: (k) => void keys.add(k) };
}

const pixels = (): PaintedPixels => ({ w: 1, h: 1, pixels: new ArrayBuffer(4) });
const tick = () => new Promise((r) => setTimeout(r, 0));

test('paints the neighbours ahead, keeps them and the current one, frees the rest', async () => {
  const textures = registry();
  const asked: string[] = [];
  const pre = new Prepainter<string>({
    textures,
    id: (m) => m,
    key: (id) => `ground_${id}`,
    painter: { paint: async (m) => (asked.push(m), pixels()) },
    canvas: () => ({}) as HTMLCanvasElement,
  });
  textures.keys.add('ground_town'); // painted on arrival by the caller
  pre.enter('town', ['forest', 'field']);
  assert.ok(pre.painting('forest'));
  await tick();
  assert.deepEqual(asked, ['forest', 'field']);
  assert.deepEqual([...textures.keys].sort(), ['ground_field', 'ground_forest', 'ground_town']);
  assert.ok(!pre.painting('forest'));
  pre.enter('forest', ['town', 'marsh']);
  await tick();
  assert.deepEqual([...textures.keys].sort(), ['ground_forest', 'ground_marsh', 'ground_town']);
  // what is painted or under way is not asked for twice
  pre.prepare('marsh');
  assert.deepEqual(asked, ['forest', 'field', 'marsh']);
});

test('a painting that arrives after the caller painted it, or after destroy, is dropped; a failure only stops that one', async () => {
  const textures = registry();
  const resolvers: ((p: PaintedPixels) => void)[] = [];
  const pre = new Prepainter<string>({
    textures,
    id: (m) => m,
    painter: { paint: (m) => (m === 'bad' ? Promise.reject(new Error('x')) : new Promise((r) => resolvers.push(r))) },
    canvas: () => ({}) as HTMLCanvasElement,
  });
  pre.enter('a', ['b', 'bad']);
  textures.keys.add('b');
  resolvers[0]!(pixels());
  await tick();
  assert.ok(!pre.painting('bad'));
  pre.prepare('c');
  pre.destroy();
  resolvers[1]!(pixels());
  await tick();
  assert.ok(!textures.keys.has('c'));
  // no painter: nothing is painted ahead
  const none = new Prepainter<string>({ textures: registry(), id: (m) => m, painter: null });
  none.prepare('x');
  assert.ok(!none.painting('x'));
});

test('a worker painter matches replies by id and gives up for good when the worker fails', async () => {
  const posted: unknown[] = [];
  const fake = { postMessage: (m: unknown) => posted.push(m), terminate: () => {}, onmessage: null as ((e: { data: unknown }) => void) | null, onerror: null as (() => void) | null };
  const painter = workerPainter<{ id: string }>({ create: () => fake as unknown as Worker, message: (map) => ({ map }) });
  const a = painter.paint({ id: 'a' }, 'a');
  const a2 = painter.paint({ id: 'a' }, 'a');
  const b = painter.paint({ id: 'b' }, 'b');
  assert.deepEqual(posted, [{ map: { id: 'a' } }, { map: { id: 'b' } }]);
  fake.onmessage!({ data: { id: 'a', w: 2, h: 1, pixels: new ArrayBuffer(8) } });
  assert.equal((await a).w, 2);
  assert.equal((await a2).w, 2);
  fake.onerror!();
  await assert.rejects(b);
  await assert.rejects(painter.paint({ id: 'c' }, 'c'));
  const broken = workerPainter({ create: () => { throw new Error('no workers here'); } });
  await assert.rejects(broken.paint('x', 'x'));
});
