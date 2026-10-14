import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Stage } from '../core/Stage.ts';
import { bootWatch, type BootStall } from './bootWatch.ts';
import { captureErrors, type CapturedError } from './captureErrors.ts';
import { noteContextLoss, rebuildDelayMs, watchContextLoss, type ContextLossVerdict } from './contextLoss.ts';
import { ErrorDeduper, trimStack } from './ErrorDeduper.ts';
import { FrameSampler } from './FrameSampler.ts';
import { countHitches, looksThrottled, percentile, summarizeFrames } from './frameStats.ts';
import type { FrameSummary } from './frameStats.ts';

test('context losses: a few are rebuilt, more inside the window give up, hidden ones do not count', () => {
  let losses: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const r = noteContextLoss(losses, 1_000 * i);
    assert.equal(r.giveUp, false);
    losses = r.losses;
  }
  assert.equal(noteContextLoss(losses, 5_000).giveUp, true);
  assert.deepEqual(noteContextLoss(losses, 120_000 + 1_500).losses, [2_000, 3_000, 121_500]);
  assert.deepEqual(noteContextLoss([1_000], 2_000, true).losses, [1_000]);
  assert.equal(noteContextLoss([1, 2], 3, false, { maxLosses: 2 }).giveUp, true);
  assert.ok(rebuildDelayMs(1) < rebuildDelayMs(2) && rebuildDelayMs(2) < rebuildDelayMs(3));
});

test('watching a canvas prevents the default and counts each loss', () => {
  const canvas = new EventTarget();
  const seen: ContextLossVerdict[] = [];
  let t = 0;
  const stop = watchContextLoss(canvas, (v) => seen.push(v), { now: () => (t += 1_000), hidden: () => false });
  const e = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(e);
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.equal(e.defaultPrevented, true);
  assert.deepEqual(seen.map((v) => v.losses.length), [1, 2]);
  stop();
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.equal(seen.length, 2);
});

test('a hung start names the step it stood on; a finished one says nothing', async () => {
  let t = 0;
  const stalls: BootStall[] = [];
  const w = bootWatch(10, (s) => stalls.push(s), () => (t += 5));
  w.step('textures');
  w.step('fonts');
  const ok = bootWatch(10, (s) => stalls.push(s));
  ok.step('scene');
  ok.done();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(stalls.length, 1);
  assert.equal(stalls[0]!.step, 'fonts');
  assert.equal(stalls[0]!.detail, 'stuck: fonts');
  assert.deepEqual(stalls[0]!.steps.map((s) => s.name), ['init', 'textures', 'fonts']);
});

test('percentiles, hitches and the summary of a window', () => {
  const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(sorted, 0.95), 96);
  assert.equal(percentile(sorted, 0.99), 100);
  assert.equal(percentile([], 0.5), 0);
  assert.equal(countHitches([16, 60, 51, 50, 17], 50), 2);
  // 99 smooth frames and one long one over two seconds
  const frames = [...Array.from({ length: 99 }, () => 16), 200];
  const s = summarizeFrames(frames, 2_000);
  assert.equal(s.frames, 100);
  assert.equal(s.fps, 50);
  assert.equal(s.fpsLow, 5);
  assert.equal(s.frameP95, 16);
  assert.equal(s.worstMs, 200);
  assert.equal(s.hitches, 1);
  assert.equal(looksThrottled(s), false);
  assert.equal(looksThrottled(summarizeFrames([1_000, 1_000, 1_000], 3_000)), true);
});

test('the sampler sums one window at a time and drops paused frames and throttled windows', () => {
  let now = 0;
  let paused = false;
  const out: FrameSummary[] = [];
  const s = new FrameSampler((x) => out.push(x), { windowMs: 1_000, minFrames: 5, now: () => now, paused: () => paused });
  for (let i = 0; i < 60; i++) {
    now += 16.7;
    s.push(16.7);
  }
  assert.equal(out.length, 1);
  assert.ok(Math.abs(out[0]!.fps - 60) < 1);
  paused = true;
  for (let i = 0; i < 100; i++) s.push(16.7);
  paused = false;
  // a throttled window: a frame a second
  for (let i = 0; i < 6; i++) {
    now += 1_000;
    s.push(1_000);
  }
  assert.equal(out.length, 1);
});

test('errors are told once each, and only so many', () => {
  const d = new ErrorDeduper(2, 5);
  assert.equal(d.admit('boom one'), 'boom ');
  assert.equal(d.admit('boom two'), null, 'same key');
  assert.equal(d.admit('other'), 'other');
  assert.equal(d.admit('third'), null, 'allowance spent');
  d.reset();
  assert.equal(d.admit('third'), 'third');
  assert.equal(trimStack('a\nb\nc\nd\ne\nf', 2), 'a\nb');
});

test('frame errors reach the callback once and the old handler is put back', () => {
  const before = (_w: string, _e: unknown) => undefined;
  Stage.onCaught = before;
  const got: CapturedError[] = [];
  const stop = captureErrors((e) => got.push(e));
  Stage.onCaught!('[frame] update', new Error('bad'));
  Stage.onCaught!('[frame] update', new Error('bad'));
  assert.equal(got.length, 1);
  assert.equal(got[0]!.source, 'frame');
  assert.equal(got[0]!.message, '[frame] update: bad');
  stop();
  assert.equal(Stage.onCaught, before);
  Stage.onCaught = null;
});
