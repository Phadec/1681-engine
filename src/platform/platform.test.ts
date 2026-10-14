import assert from 'node:assert/strict';
import { test } from 'node:test';
import { engineSettings } from '../settings.ts';
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen, onFullscreenChange, toggleFullscreen, type FullscreenDocument } from './fullscreen.ts';
import { currentOrientationKind, lockOrientation, unlockOrientation } from './orientation.ts';
import { exitPointerLock, isPointerLocked, onPointerLockChange, requestPointerLock, type PointerLockDocument } from './pointerLock.ts';
import { followReducedMotion, onReducedMotionChange, prefersReducedMotion, type MotionQuery } from './reducedMotion.ts';

function events() {
  const map = new Map<string, Set<() => void>>();
  return {
    addEventListener: (t: string, fn: () => void) => (map.get(t) ?? map.set(t, new Set()).get(t)!).add(fn),
    removeEventListener: (t: string, fn: () => void) => map.get(t)?.delete(fn),
    fire: (t: string) => map.get(t)?.forEach((fn) => fn()),
    count: () => [...map.values()].reduce((n, s) => n + s.size, 0),
  };
}

test('fullscreen through the standard API', async () => {
  const ev = events();
  const el = {} as Element;
  const doc: FullscreenDocument & { fullscreenElement: Element | null } = {
    ...ev,
    fullscreenEnabled: true,
    fullscreenElement: null,
    documentElement: Object.assign(el, { requestFullscreen: async () => void (doc.fullscreenElement = el) }),
    exitFullscreen: async () => void (doc.fullscreenElement = null),
  };
  const seen: boolean[] = [];
  const off = onFullscreenChange((f) => seen.push(f), doc);
  assert.equal(fullscreenSupported(doc), true);
  assert.equal(await enterFullscreen(undefined, doc), true);
  ev.fire('fullscreenchange');
  assert.equal(isFullscreen(doc), true);
  assert.equal(await toggleFullscreen(undefined, doc), false);
  ev.fire('fullscreenchange');
  assert.deepEqual(seen, [true, false]);
  assert.equal(await exitFullscreen(doc), false, 'nothing to leave');
  off();
  assert.equal(ev.count(), 0);
});

test('fullscreen falls back to the webkit names and is a no-op without either', async () => {
  const ev = events();
  let entered = false;
  const el = { webkitRequestFullscreen: () => void (entered = true) } as unknown as Element;
  const doc: FullscreenDocument = { ...ev, webkitFullscreenEnabled: true, documentElement: el };
  assert.equal(await enterFullscreen(undefined, doc), true);
  assert.equal(entered, true);
  assert.equal(await enterFullscreen({} as Element, doc), false);
  assert.equal(await enterFullscreen(undefined, null), false);
  assert.equal(isFullscreen(null), false);
  const refused = { requestFullscreen: async () => { throw new Error('no gesture'); } } as unknown as Element;
  assert.equal(await enterFullscreen(refused, { ...ev, fullscreenEnabled: true }), false);
});

test('orientation lock resolves false where it is refused or missing', async () => {
  let locked = '';
  const ok = { type: 'portrait-primary', lock: async (o: string) => void (locked = o), unlock: () => void (locked = '') };
  assert.equal(await lockOrientation('landscape', ok), true);
  assert.equal(locked, 'landscape');
  unlockOrientation(ok);
  assert.equal(locked, '');
  assert.equal(currentOrientationKind(ok), 'portrait');
  assert.equal(await lockOrientation('landscape', { lock: async () => { throw new Error('NotSupportedError'); } }), false);
  assert.equal(await lockOrientation('landscape', {}), false);
  assert.equal(await lockOrientation('landscape', null), false);
  assert.equal(currentOrientationKind(null), null);
  unlockOrientation({ unlock: () => { throw new Error('nothing locked'); } });
});

test('reduced motion is read, followed and mirrored into the settings', () => {
  const ev = events();
  const q: MotionQuery & { matches: boolean } = { matches: true, addEventListener: (_t, fn) => ev.addEventListener('change', fn), removeEventListener: (_t, fn) => ev.removeEventListener('change', fn) };
  assert.equal(prefersReducedMotion(q), true);
  assert.equal(prefersReducedMotion(null), false);
  const seen: boolean[] = [];
  const off = onReducedMotionChange((r) => seen.push(r), q);
  engineSettings.set({ reducedFx: false });
  const stop = followReducedMotion(q);
  assert.equal(engineSettings.getState().reducedFx, true);
  q.matches = false;
  ev.fire('change');
  assert.equal(engineSettings.getState().reducedFx, false);
  assert.deepEqual(seen, [false]);
  off();
  stop();
  assert.equal(ev.count(), 0);
  engineSettings.reset();
});

test('reduced motion falls back to the old listener names', () => {
  const fns: (() => void)[] = [];
  const q: MotionQuery = { matches: false, addListener: (fn) => fns.push(fn), removeListener: (fn) => fns.splice(fns.indexOf(fn), 1) };
  const off = onReducedMotionChange(() => {}, q);
  assert.equal(fns.length, 1);
  off();
  assert.equal(fns.length, 0);
});

test('pointer lock asks, falls back from raw input, and reports changes', async () => {
  const ev = events();
  const doc: PointerLockDocument & { pointerLockElement: Element | null } = { ...ev, pointerLockElement: null, exitPointerLock: () => void (doc.pointerLockElement = null) };
  const asked: unknown[] = [];
  const canvas = {
    requestPointerLock: async (o?: unknown) => {
      asked.push(o);
      if (o) throw new Error('unadjustedMovement not supported');
      doc.pointerLockElement = canvas;
    },
  } as unknown as Element;
  const seen: boolean[] = [];
  const off = onPointerLockChange((l) => seen.push(l), doc);
  assert.equal(await requestPointerLock(canvas, { raw: true }, doc), true);
  assert.deepEqual(asked, [{ unadjustedMovement: true }, undefined]);
  assert.equal(isPointerLocked(canvas, doc), true);
  assert.equal(isPointerLocked({} as Element, doc), false);
  ev.fire('pointerlockchange');
  exitPointerLock(doc);
  ev.fire('pointerlockchange');
  assert.deepEqual(seen, [true, false]);
  assert.equal(await requestPointerLock({} as Element, {}, doc), false);
  off();
});
