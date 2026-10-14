import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackStack, doubleBackToExit } from './backButton.ts';
import { capacitorConfig, installBackButton, nativeBuildOf, type AppLike } from './capacitor.ts';
import { keepScreenOn, safeAreaInsets, type WakeLockLike } from './screen.ts';

test('back goes to the top handler first, down the stack, then to the root', () => {
  let root = 0;
  const stack = new BackStack(() => root++);
  const log: string[] = [];
  stack.push(() => (log.push('menu'), false));
  const closeDialog = stack.push(() => (log.push('dialog'), true));
  assert.equal(stack.press(), true);
  assert.deepEqual(log, ['dialog']);
  closeDialog();
  assert.equal(stack.press(), false);
  assert.deepEqual(log, ['dialog', 'menu']);
  assert.equal(root, 1);
  closeDialog(); // twice is nothing
  assert.equal(stack.size, 1);
});

test('taking off a handler from the middle leaves the others in order', () => {
  const stack = new BackStack();
  const log: string[] = [];
  stack.push(() => (log.push('a'), false));
  const b = stack.push(() => (log.push('b'), false));
  stack.push(() => (log.push('c'), false));
  b();
  stack.press();
  assert.deepEqual(log, ['c', 'a']);
});

test('a second back soon after the first quits; a late one only warns again', () => {
  let t = 0;
  const said: string[] = [];
  const root = doubleBackToExit({ notify: () => said.push('again?'), exit: () => said.push('bye'), withinMs: 2000, now: () => t });
  root();
  t = 2500;
  root();
  t = 3000;
  root();
  assert.deepEqual(said, ['again?', 'again?', 'bye']);
  t = 3100;
  root();
  assert.deepEqual(said, ['again?', 'again?', 'bye', 'again?'], 'after quitting it starts over');
});

test('the back button reaches the stack, and the uninstall removes the listener', async () => {
  let listener: (() => void) | null = null;
  let removed = 0;
  const app: AppLike = {
    addListener: (_e, cb) => {
      listener = () => cb({ canGoBack: false });
      return Promise.resolve({ remove: () => void removed++ });
    },
    exitApp: () => undefined,
  };
  let pressed = 0;
  const stack = new BackStack();
  stack.push(() => (pressed++, true));
  const uninstall = await installBackButton(app, stack);
  listener!();
  assert.equal(pressed, 1);
  uninstall();
  assert.equal(removed, 1);
});

test('the native build is read from the app info: a number, Infinity with no native layer, 0 when unreadable', async () => {
  assert.equal(await nativeBuildOf({ getInfo: async () => ({ version: '1.2.0', build: '508' }) }), 508);
  assert.equal(await nativeBuildOf({ getInfo: async () => ({ version: '1.2.0', build: '508.1' }) }), 508);
  assert.equal(await nativeBuildOf({ getInfo: async () => ({ version: '1', build: 'beta' }) }), 0);
  assert.equal(await nativeBuildOf({ getInfo: () => Promise.reject(new Error('Not implemented on web.')) }), Infinity);
  assert.equal(await nativeBuildOf(null), Infinity);
  assert.equal(await nativeBuildOf({}), Infinity);
});

test('the Capacitor config carries a game\'s defaults, and the game\'s own laid over them', () => {
  const c = capacitorConfig({ appId: 'com.example.game', appName: 'Game', extra: { plugins: { SplashScreen: { launchShowDuration: 0 } }, android: { minWebViewVersion: 90 } } }) as {
    webDir: string;
    server: { androidScheme: string };
    android: Record<string, unknown>;
    ios: Record<string, unknown>;
    plugins: Record<string, Record<string, unknown>>;
  };
  assert.equal(c.webDir, 'dist');
  assert.equal(c.server.androidScheme, 'https');
  assert.equal(c.android.webContentsDebuggingEnabled, false);
  assert.equal(c.android.minWebViewVersion, 90);
  assert.equal(c.android.allowMixedContent, false, 'merged, not replaced');
  assert.equal(c.ios.contentInset, 'never');
  assert.deepEqual(c.plugins.SplashScreen, { launchAutoHide: false, backgroundColor: '#000000', showSpinner: false, launchShowDuration: 0 });
  assert.equal(c.plugins.CapacitorUpdater!.autoUpdate, false);
  const debug = capacitorConfig({ appId: 'com.example.game', appName: 'Game', debug: true, backgroundColor: '#123456' }) as { android: Record<string, unknown>; backgroundColor: string };
  assert.equal(debug.android.webContentsDebuggingEnabled, true);
  assert.equal(debug.backgroundColor, '#123456');
  for (const bad of ['game', 'com..game', '1com.game', 'com.game-x']) assert.throws(() => capacitorConfig({ appId: bad, appName: 'x' }), /reverse-domain/, bad);
});

test('the screen is kept on, asked for again when the page comes back, and let go on release', async () => {
  const listeners = new Map<string, () => void>();
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (t: string, cb: () => void) => listeners.set(t, cb),
    removeEventListener: (t: string) => listeners.delete(t),
  };
  let requests = 0;
  let released = 0;
  const locks: (() => void)[] = [];
  const wakeLock: WakeLockLike = {
    request: async () => {
      requests++;
      let onRelease = () => undefined as void;
      locks.push(() => onRelease());
      return { release: async () => void released++, addEventListener: (_t, cb) => (onRelease = cb) };
    },
  };
  const release = await keepScreenOn(wakeLock, doc as never);
  assert.equal(requests, 1);
  // the page hides: the browser drops the lock; it shows again: asked for anew
  locks[0]!();
  doc.visibilityState = 'hidden';
  listeners.get('visibilitychange')!();
  assert.equal(requests, 1);
  doc.visibilityState = 'visible';
  listeners.get('visibilitychange')!();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(requests, 2);
  release();
  assert.equal(released, 1);
  assert.equal(listeners.size, 0);
});

test('no wake lock API, or a refusal, is no error', async () => {
  const off = await keepScreenOn(undefined, undefined);
  off();
  const refuse = await keepScreenOn({ request: () => Promise.reject(new Error('NotAllowedError')) }, undefined);
  refuse();
  assert.deepEqual(safeAreaInsets(undefined), { top: 0, right: 0, bottom: 0, left: 0 });
});
