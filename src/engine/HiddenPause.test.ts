import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HiddenPause } from './HiddenPause.ts';

function loop() {
  const l = { paused: false, pauses: 0, resumes: 0, pause() { l.paused = true; l.pauses++; }, resume() { l.paused = false; l.resumes++; } };
  return l;
}

test('a hidden page pauses the loop and showing it resumes it', () => {
  const l = loop();
  const h = new HiddenPause(l);
  h.hidden();
  assert.equal(l.paused, true);
  h.shown();
  assert.equal(l.paused, false);
  assert.deepEqual([l.pauses, l.resumes], [1, 1]);
});

test("a game's own pause survives the tab coming back", () => {
  const l = loop();
  const h = new HiddenPause(l);
  l.pause();
  h.hidden();
  h.shown();
  assert.equal(l.paused, true);
  assert.equal(l.resumes, 0);
});

test('a pause the game takes over while hidden is not undone', () => {
  const l = loop();
  const h = new HiddenPause(l);
  h.hidden();
  h.forget();
  h.shown();
  assert.equal(l.paused, true);
});

test('watch reads visibilitychange and an already hidden page', () => {
  const l = loop();
  const listeners: (() => void)[] = [];
  const doc = {
    visibilityState: 'hidden' as DocumentVisibilityState,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.splice(listeners.indexOf(fn), 1),
  } as unknown as Document;
  const h = new HiddenPause(l);
  const off = h.watch(doc);
  assert.equal(l.paused, true);
  (doc as { visibilityState: string }).visibilityState = 'visible';
  listeners[0]!();
  assert.equal(l.paused, false);
  off();
  assert.equal(listeners.length, 0);
});
