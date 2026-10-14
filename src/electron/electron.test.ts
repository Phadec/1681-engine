import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { InputLike } from './electronLike.ts';
import { denyPermissions, lockDownWindow, refuseDebugLaunch } from './lockdown.ts';
import { debuggerRequested, isAllowedExternal, isAllowedNavigation, isDevToolsKey, type ExternalPolicy } from './lockdownRules.ts';
import { registerSessionStore, SessionStore } from './sessionStore.ts';
import { shellId } from './shellId.ts';

const temp = () => mkdtempSync(join(tmpdir(), 'e1681-'));

test('shellId hashes the runtime version and the main process code, and nothing else', () => {
  const dir = temp();
  try {
    writeFileSync(join(dir, 'main.cjs'), 'a');
    writeFileSync(join(dir, 'preload.cjs'), 'b');
    writeFileSync(join(dir, 'notes.txt'), 'ignored');
    // the hash a shell built before this module wrote: publish scripts and installed shells must agree
    const h = createHash('sha256');
    h.update('electron 38.0.0\n');
    for (const n of ['main.cjs', 'preload.cjs']) h.update(`${n}\n`).update(readFileSync(join(dir, n)));
    const id = shellId('38.0.0', dir);
    assert.equal(id, h.digest('hex').slice(0, 16));
    assert.equal(shellId('38.0.0', { dirs: [dir] }), id);
    assert.notEqual(shellId('38.0.1', dir), id);
    assert.notEqual(shellId('38.0.0', { dirs: [dir], extra: ['engine 0.6.0'] }), id);
    writeFileSync(join(dir, 'main.cjs'), 'c');
    assert.notEqual(shellId('38.0.0', dir), id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fakeSafeStorage(available = true, backend?: string) {
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend ?? 'gnome_libsecret',
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => {
      const t = b.toString();
      if (!t.startsWith('enc:')) throw new Error('not ours');
      return t.slice(4);
    },
  };
}

test('the session store keeps one value encrypted, atomically, and refuses where the OS cannot encrypt', async () => {
  const dir = temp();
  try {
    const s = new SessionStore({ safeStorage: fakeSafeStorage(), dir, fileName: 's.bin' });
    assert.equal(await s.get(), null);
    assert.equal(await s.set('{"token":"t"}'), true);
    assert.equal(readFileSync(join(dir, 's.bin'), 'utf8'), 'enc:{"token":"t"}');
    assert.deepEqual(readdirSync(dir), ['s.bin'], 'no temp file left beside it');
    assert.equal(await s.get(), '{"token":"t"}');
    assert.equal(await s.set(42), false);
    assert.equal(await s.set('x'.repeat(5000)), false);
    await s.clear();
    assert.equal(await s.get(), null);

    const linux = new SessionStore({ safeStorage: fakeSafeStorage(true, 'basic_text'), dir, platform: 'linux' });
    assert.equal(linux.canEncrypt(), false);
    assert.equal(await linux.set('t'), false);
    assert.equal(new SessionStore({ safeStorage: fakeSafeStorage(true, 'basic_text'), dir, platform: 'darwin' }).canEncrypt(), true);
    assert.equal(new SessionStore({ safeStorage: fakeSafeStorage(false), dir }).canEncrypt(), false);

    writeFileSync(join(dir, 'session.bin'), 'garbage');
    assert.equal(await new SessionStore({ safeStorage: fakeSafeStorage(), dir }).get(), null, 'an unreadable file is no session');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the session store answers its three channels and takes them back', async () => {
  const dir = temp();
  try {
    const handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>();
    const ipc = { handle: (c: string, fn: (e: unknown, ...a: unknown[]) => unknown) => void handlers.set(c, fn), removeHandler: (c: string) => void handlers.delete(c) };
    const off = registerSessionStore(ipc, new SessionStore({ safeStorage: fakeSafeStorage(), dir }), 'auth');
    assert.deepEqual([...handlers.keys()], ['auth:get', 'auth:set', 'auth:clear']);
    assert.equal(await handlers.get('auth:set')!({}, 'v'), true);
    assert.equal(await handlers.get('auth:get')!({}), 'v');
    off();
    assert.equal(handlers.size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const POLICY: ExternalPolicy = { hosts: ['example.com', 'chat.example'], paths: [{ host: 'code.example', prefix: '/owner/' }] };

test('only https links to listed hosts, or listed paths of a shared host, leave for the browser', () => {
  assert.equal(isAllowedExternal('https://example.com/x', POLICY), true);
  assert.equal(isAllowedExternal('https://www.EXAMPLE.com/x', POLICY), true);
  assert.equal(isAllowedExternal('https://badexample.com/', POLICY), false);
  assert.equal(isAllowedExternal('http://example.com/', POLICY), false);
  assert.equal(isAllowedExternal('https://user:pw@example.com/', POLICY), false);
  assert.equal(isAllowedExternal('https://code.example/Owner/repo', POLICY), true);
  assert.equal(isAllowedExternal('https://code.example/someone/repo', POLICY), false);
  assert.equal(isAllowedExternal('not a url', POLICY), false);
  assert.equal(isAllowedNavigation('file:///app/index.html'), true);
  assert.equal(isAllowedNavigation('https://example.com/'), false);
  assert.equal(isAllowedNavigation('http://127.0.0.1:5173/x', 'http://127.0.0.1:5173'), true);
  assert.equal(isAllowedNavigation('file:///x', 'http://127.0.0.1:5173'), false);
});

const key = (k: string, mods: Partial<InputLike> = {}): InputLike => ({ type: 'keyDown', key: k, control: false, meta: false, shift: false, alt: false, ...mods });

test('the DevTools keys and the debugger switches are recognised', () => {
  assert.equal(isDevToolsKey(key('F12')), true);
  assert.equal(isDevToolsKey(key('I', { control: true, shift: true })), true);
  assert.equal(isDevToolsKey(key('j', { meta: true, alt: true })), true);
  assert.equal(isDevToolsKey(key('i', { control: true })), false);
  assert.equal(isDevToolsKey({ ...key('F12'), type: 'keyUp' }), false);
  assert.equal(debuggerRequested(['app', '--inspect=9229']), true);
  assert.equal(debuggerRequested(['app', '--inspect-brk']), true);
  assert.equal(debuggerRequested(['app', '--remote-debugging-port=1']), true);
  assert.equal(debuggerRequested(['app', '--inspector']), false);
  assert.equal(debuggerRequested(['app'], (s) => s === 'inspect'), true);
  const exits: number[] = [];
  const app = (packaged: boolean) => ({ isPackaged: packaged, commandLine: { hasSwitch: () => false } });
  assert.equal(refuseDebugLaunch(app(false), ['--inspect'], (c) => exits.push(c)), false, 'a dev run may debug');
  assert.equal(refuseDebugLaunch(app(true), ['x'], (c) => exits.push(c)), false);
  const err = console.error;
  console.error = () => undefined;
  try {
    assert.equal(refuseDebugLaunch(app(true), ['--inspect'], (c) => exits.push(c)), true);
  } finally {
    console.error = err;
  }
  assert.deepEqual(exits, [1]);
});

function fakeWindow() {
  const listeners = new Map<string, (...a: unknown[]) => void>();
  let openHandler: ((d: { url: string }) => unknown) | null = null;
  let toggled = 0;
  const win = {
    webContents: {
      setWindowOpenHandler: (h: (d: { url: string }) => unknown) => void (openHandler = h),
      on: (e: string, l: (...a: unknown[]) => void) => void listeners.set(e, l),
      toggleDevTools: () => void toggled++,
    },
  };
  const event = () => {
    const e = { prevented: false, preventDefault: () => void (e.prevented = true) };
    return e;
  };
  return { win, listeners, open: (url: string) => openHandler!({ url }), event, toggled: () => toggled };
}

test('a locked-down window opens no window, stays on the game and refuses DevTools when packaged', () => {
  const opened: string[] = [];
  const shell = { openExternal: async (u: string) => void opened.push(u) };
  const f = fakeWindow();
  lockDownWindow(f.win, { shell, external: POLICY, packaged: true, log: () => undefined });
  assert.deepEqual(f.open('https://example.com/a'), { action: 'deny' });
  assert.deepEqual(f.open('https://evil.example/a'), { action: 'deny' });
  const nav = f.event();
  f.listeners.get('will-navigate')!(nav, 'https://example.com/b');
  assert.equal(nav.prevented, true);
  assert.deepEqual(opened, ['https://example.com/a', 'https://example.com/b']);
  const home = f.event();
  f.listeners.get('will-navigate')!(home, 'file:///app/index.html');
  assert.equal(home.prevented, false);
  const redirect = f.event();
  f.listeners.get('will-redirect')!(redirect, 'https://example.com/');
  assert.equal(redirect.prevented, true);
  const k = f.event();
  f.listeners.get('before-input-event')!(k, key('F12'));
  assert.equal(k.prevented, true);
  assert.equal(f.toggled(), 0);

  const dev = fakeWindow();
  lockDownWindow(dev.win, { shell, external: POLICY, packaged: false, devServerUrl: 'http://127.0.0.1:5173', log: () => undefined });
  dev.listeners.get('before-input-event')!(dev.event(), key('F12'));
  assert.equal(dev.toggled(), 1);
});

test('permissions are refused but the ones allowed', () => {
  let request: ((wc: unknown, p: string, cb: (g: boolean) => void, d: unknown) => void) | null = null;
  let check: ((wc: unknown, p: string, o: string, d: unknown) => boolean) | null = null;
  denyPermissions({ setPermissionRequestHandler: (h) => void (request = h), setPermissionCheckHandler: (h) => void (check = h) }, ['fullscreen']);
  const got: boolean[] = [];
  request!(null, 'media', (g) => got.push(g), {});
  request!(null, 'fullscreen', (g) => got.push(g), {});
  assert.deepEqual(got, [false, true]);
  assert.equal(check!(null, 'notifications', 'file://', {}), false);
});
