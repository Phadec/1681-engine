import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen, onFullscreenChange, toggleFullscreen } from '../../src/platform/fullscreen';
import { currentOrientationKind, lockOrientation, unlockOrientation } from '../../src/platform/orientation';
import { exitPointerLock, isPointerLocked, onPointerLockChange, requestPointerLock } from '../../src/platform/pointerLock';

/*
 * The real browser APIs, which refuse most of these outside a user gesture or on a desktop: the helpers must answer
 * false and never throw, and must report the truth when the browser does grant them.
 */

afterEach(async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  if (document.pointerLockElement) document.exitPointerLock();
});

/** Runs `fn` inside a real (trusted) click, which is what browsers want before they grant fullscreen or a lock. */
async function inGesture<T>(fn: () => Promise<T>): Promise<T> {
  const button = document.createElement('button');
  button.textContent = 'go';
  document.body.appendChild(button);
  try {
    let result: Promise<T> | null = null;
    button.addEventListener('click', () => (result = fn()), { once: true });
    await userEvent.click(button);
    return await result!;
  } finally {
    button.remove();
  }
}

test('a fullscreen request the browser refuses resolves false, never a throw', async () => {
  expect(typeof fullscreenSupported()).toBe('boolean');
  // an element not in the document is refused whatever gesture came before
  expect(await enterFullscreen(document.createElement('div'))).toBe(false);
  expect(isFullscreen()).toBe(false);
  expect(await exitFullscreen()).toBe(false);
});

test('fullscreen inside a gesture reports what the browser did, and the change is heard', async () => {
  const heard: boolean[] = [];
  const off = onFullscreenChange((on) => heard.push(on));
  const target = document.createElement('div');
  document.body.appendChild(target);
  try {
    const entered = await inGesture(() => enterFullscreen(target));
    expect(entered).toBe(isFullscreen());
    if (entered) {
      expect(document.fullscreenElement).toBe(target);
      expect(await toggleFullscreen()).toBe(false);
      expect(isFullscreen()).toBe(false);
      await new Promise((r) => setTimeout(r, 50));
      expect(heard).toContain(true);
      expect(heard[heard.length - 1]).toBe(false);
    }
  } finally {
    off();
    target.remove();
  }
});

test('a pointer lock the browser refuses resolves false, plain or raw', async () => {
  // a canvas not in the document is refused (WrongDocumentError), with or without a gesture before it
  const canvas = document.createElement('canvas');
  expect(await requestPointerLock(canvas)).toBe(false);
  expect(await requestPointerLock(canvas, { raw: true })).toBe(false);
  expect(isPointerLocked()).toBe(false);
  exitPointerLock(); // nothing holds it: a no-op
});

test('pointer lock inside a gesture reports what the browser did', async () => {
  // granted on Linux; refused in the test iframe on macOS: either way the answer must match the document
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const heard: boolean[] = [];
  const off = onPointerLockChange((on) => heard.push(on));
  try {
    const locked = await inGesture(() => requestPointerLock(canvas, { raw: true }));
    expect(locked).toBe(isPointerLocked(canvas));
    if (locked) {
      exitPointerLock();
      await new Promise((r) => setTimeout(r, 50));
      expect(isPointerLocked()).toBe(false);
      expect(heard).toContain(true);
      expect(heard[heard.length - 1]).toBe(false);
    }
  } finally {
    off();
    canvas.remove();
  }
});

test('orientation: a value the browser rejects resolves false, and unlocking never throws', async () => {
  // what a real lock answers depends on the platform (headless Chromium resolves it): only that it is a boolean
  expect(typeof (await lockOrientation('landscape'))).toBe('boolean');
  expect(await lockOrientation('sideways' as never)).toBe(false);
  expect(() => unlockOrientation()).not.toThrow();
  expect(() => unlockOrientation()).not.toThrow();
  // an 800×600 window
  expect(currentOrientationKind()).toBe('landscape');
});
