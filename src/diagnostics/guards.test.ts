import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Application, Renderer, Ticker } from 'pixi.js';
import { Stage } from '../core/Stage.ts';
import { bootWatch, type BootStall } from './bootWatch.ts';
import { captureErrors, type CapturedError } from './captureErrors.ts';
import { watchContextLoss } from './contextLoss.ts';
import { ErrorDeduper } from './ErrorDeduper.ts';
import { FrameSampler } from './FrameSampler.ts';
import { summarizeFrames } from './frameStats.ts';
import type { FrameSummary } from './frameStats.ts';
import { gpuName, maxTextureSize } from './gpuInfo.ts';
import { describeError, guardRender } from './renderGuard.ts';

/** A ticker that runs its listeners when told, in the order they were added. */
function fakeTicker() {
  const listeners: { fn: () => void; ctx: unknown }[] = [];
  const ticker = {
    deltaMS: 16,
    add(fn: () => void, ctx?: unknown) {
      listeners.push({ fn, ctx });
      return ticker;
    },
    remove(fn: () => void, ctx?: unknown) {
      const i = listeners.findIndex((l) => l.fn === fn && (ctx === undefined || l.ctx === ctx));
      if (i >= 0) listeners.splice(i, 1);
      return ticker;
    },
    tick() {
      for (const l of [...listeners]) l.fn.call(l.ctx);
    },
    listeners,
  };
  return ticker;
}

function fakeApp(render: () => void) {
  const ticker = fakeTicker();
  const app = { ticker, render };
  ticker.add(app.render, app);
  return { app: app as unknown as Application, ticker };
}

function quietly<T>(fn: () => T): T {
  const error = console.error;
  console.error = () => undefined;
  try {
    return fn();
  } finally {
    console.error = error;
  }
}

test('an error is one short line, cut with an ellipsis', () => {
  assert.equal(describeError(new TypeError('x is not a function')), 'TypeError: x is not a function');
  assert.equal(describeError('plain'), 'plain');
  assert.equal(describeError(42), '42');
  assert.equal(describeError(new Error('a'.repeat(50)), 10), 'Error: aaa…');
});

test('a guarded render lets one bad frame go and reports a renderer that keeps failing, once', () => {
  let fail = false;
  let rendered = 0;
  const { app, ticker } = fakeApp(() => {
    if (fail) throw new Error('lost');
    rendered++;
  });
  const told: string[] = [];
  const uninstall = guardRender(app, (detail) => told.push(detail), 3);
  assert.equal(ticker.listeners.length, 1, "Pixi's own render was taken off");
  ticker.tick();
  assert.equal(rendered, 1);
  quietly(() => {
    fail = true;
    ticker.tick();
    ticker.tick();
    fail = false;
    ticker.tick(); // a good frame resets the run
    fail = true;
    for (let i = 0; i < 10; i++) ticker.tick();
  });
  assert.deepEqual(told, ['render: Error: lost']);
  uninstall();
  assert.equal(ticker.listeners.length, 1);
  assert.equal(ticker.listeners[0]!.fn, app.render, "Pixi's render is back");
});

test('the guard logs only the first failure of a run', () => {
  const { app, ticker } = fakeApp(() => {
    throw new Error('x');
  });
  guardRender(app, () => undefined, 100);
  const error = console.error;
  let logged = 0;
  console.error = () => logged++;
  try {
    for (let i = 0; i < 5; i++) ticker.tick();
  } finally {
    console.error = error;
  }
  assert.equal(logged, 1);
});

test('GPU limits and name come from WebGL, and are null where there is none', () => {
  const ext = { UNMASKED_RENDERER_WEBGL: 0x9246 };
  const gl = {
    MAX_TEXTURE_SIZE: 0x0d33,
    getParameter: (p: number) => (p === 0x0d33 ? 4096 : p === 0x9246 ? 'Adreno (TM) 610' + ' '.repeat(100) : null),
    getExtension: (name: string) => (name === 'WEBGL_debug_renderer_info' ? ext : null),
  };
  const webgl = { gl } as unknown as Renderer;
  assert.equal(maxTextureSize(webgl), 4096);
  assert.equal(gpuName(webgl), ('Adreno (TM) 610' + ' '.repeat(100)).slice(0, 80));
  assert.equal(gpuName(webgl, 6), 'Adreno');
  const gpu = {} as unknown as Renderer;
  assert.equal(maxTextureSize(gpu), null);
  assert.equal(gpuName(gpu), null);
  const hidden = { gl: { ...gl, getExtension: () => null } } as unknown as Renderer;
  assert.equal(gpuName(hidden), null, 'the browser hides the name');
  const broken = { gl: { ...gl, getParameter: () => 0 } } as unknown as Renderer;
  assert.equal(maxTextureSize(broken), null, 'a nonsense size is no size');
  const throws = {
    gl: {
      getExtension: () => {
        throw new Error('no');
      },
    },
  } as unknown as Renderer;
  assert.equal(gpuName(throws), null);
});

test('window errors and unhandled rejections are captured, and stop being captured after the uninstall', () => {
  const g = globalThis as { window?: EventTarget };
  const before = g.window;
  g.window = new EventTarget();
  try {
    const got: CapturedError[] = [];
    const stop = captureErrors((e) => got.push(e), { frames: false });
    const err = Object.assign(new Event('error'), { message: 'Uncaught boom', error: { stack: 'boom\n at a\n at b' } });
    g.window.dispatchEvent(err);
    const rej = Object.assign(new Event('unhandledrejection'), { reason: new Error('nope') });
    g.window.dispatchEvent(rej);
    g.window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'just a string' }));
    assert.deepEqual(
      got.map((e) => `${e.source}:${e.message}`),
      ['uncaught:Uncaught boom', 'rejection:nope', 'rejection:just a string'],
    );
    assert.equal(got[0]!.stack, 'boom\n at a\n at b');
    assert.equal(got[2]!.stack, '');
    stop();
    g.window.dispatchEvent(Object.assign(new Event('error'), { message: 'later' }));
    assert.equal(got.length, 3);
  } finally {
    g.window = before;
  }
});

test('frames: false leaves Stage.onCaught alone, and a shared deduper keeps one error from being told twice', () => {
  Stage.onCaught = null;
  const got: CapturedError[] = [];
  const shared = new ErrorDeduper();
  shared.admit('[frame] update: told by the game');
  const stopA = captureErrors((e) => got.push(e), { frames: false });
  assert.equal(Stage.onCaught, null);
  stopA();
  const stopB = captureErrors((e) => got.push(e), { deduper: shared });
  Stage.onCaught!('[frame] update', new Error('told by the game'));
  Stage.onCaught!('[frame] update', 'a thrown string');
  assert.deepEqual(got.map((e) => e.message), ['[frame] update: a thrown string']);
  stopB();
  assert.equal(Stage.onCaught, null);
});

test('an uninstall does not undo a handler laid over it later', () => {
  Stage.onCaught = null;
  const stop = captureErrors(() => undefined);
  const later = () => undefined;
  Stage.onCaught = later;
  stop();
  assert.equal(Stage.onCaught, later);
  Stage.onCaught = null;
});

test('the max allowance caps distinct captured errors', () => {
  Stage.onCaught = null;
  const got: CapturedError[] = [];
  const stop = captureErrors((e) => got.push(e), { max: 2 });
  for (const m of ['a', 'b', 'c', 'd']) Stage.onCaught!('w', new Error(m));
  assert.equal(got.length, 2);
  stop();
});

test('a restored context is told; a stopped watch hears nothing', () => {
  const canvas = new EventTarget();
  let restored = 0;
  let lost = 0;
  const stop = watchContextLoss(canvas, () => lost++, { onRestored: () => restored++, now: () => 0, hidden: () => false });
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.equal(restored, 1);
  stop();
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.equal(restored, 1);
  assert.equal(lost, 0);
});

test('a hidden page loses its context without counting against the GPU', () => {
  const canvas = new EventTarget();
  const counts: number[] = [];
  let hidden = true;
  let t = 0;
  watchContextLoss(canvas, (v) => counts.push(v.losses.length), { now: () => (t += 10), hidden: () => hidden });
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  hidden = false;
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.deepEqual(counts, [0, 1]);
});

test('steps after done are ignored, and step times are measured from the start', async () => {
  let t = 100;
  const stalls: BootStall[] = [];
  const w = bootWatch(5, (s) => stalls.push(s), () => t);
  t = 140;
  w.step('atlas');
  t = 170.4;
  w.step('map');
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(stalls[0]!.steps, [
    { name: 'init', atMs: 0 },
    { name: 'atlas', atMs: 40 },
    { name: 'map', atMs: 70 },
  ]);
  w.done();
  w.step('late');
  assert.equal(stalls[0]!.steps.length, 3, 'the report is a copy');
});

test('a sampler reset drops the frames counted so far; attach feeds it from the ticker until detached', () => {
  let now = 0;
  const out: FrameSummary[] = [];
  const s = new FrameSampler((x) => out.push(x), { windowMs: 100, minFrames: 3, now: () => now, paused: () => false });
  for (let i = 0; i < 5; i++) {
    now += 10;
    s.push(10);
  }
  s.reset();
  now += 60;
  s.push(10);
  assert.equal(out.length, 0, 'the window began again at the reset');
  now += 50;
  s.push(10);
  assert.equal(out.length, 0, 'two frames are under minFrames');

  const ticker = fakeTicker();
  const detach = s.attach(ticker as unknown as Ticker);
  for (let i = 0; i < 10; i++) {
    now += 16;
    ticker.tick();
  }
  assert.equal(out.length, 1);
  assert.equal(out[0]!.frameMedian, 16);
  detach();
  assert.equal(ticker.listeners.length, 0);
});

test('a summary of nothing has no NaN in it', () => {
  const s = summarizeFrames([], 0);
  assert.deepEqual(s, { frames: 0, fps: 0, fpsLow: 1000, frameP95: 0, frameMedian: 0, worstMs: 0, hitches: 0 });
  assert.equal(summarizeFrames([10, 60, 70], 140, 65).hitches, 1, 'the hitch threshold is the one given');
});
