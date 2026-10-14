import type { AppLike, SessionLike, ShellLike, WindowLike } from './electronLike';
import { debuggerRequested, isAllowedExternal, isAllowedNavigation, isDevToolsKey, type ExternalPolicy } from './lockdownRules';

/** How {@link lockDownWindow} treats a window. */
export interface LockdownOptions {
  /** `electron.shell`, which opens an allowed link in the system browser. */
  shell: ShellLike;
  /** The links that may leave for the system browser. */
  external: ExternalPolicy;
  /** `app.isPackaged`: a packaged build refuses the DevTools keys. */
  packaged: boolean;
  /** A dev run's page origin, allowed for navigation; leave unset in a packaged build whatever the environment says. */
  devServerUrl?: string;
  /** In a dev run, this key toggles DevTools. Default `F12`; null for none. */
  devToolsKey?: string | null;
  /** Where refusals are reported. Default `console.log`. */
  log?: (...args: unknown[]) => void;
}

/**
 * Keeps a window on the game: a new window is never opened (an allowed link goes to the system browser instead, any
 * other is refused), the window never navigates or redirects away from the game's own page, and a packaged build
 * refuses the DevTools keys (set `webPreferences.devTools: !app.isPackaged` too: the keys are only the visible way in).
 */
export function lockDownWindow(win: WindowLike, o: LockdownOptions): void {
  const log = o.log ?? ((...a: unknown[]) => console.log(...a));
  const wc = win.webContents;
  const openOut = (url: string, what: string): void => {
    if (isAllowedExternal(url, o.external)) void o.shell.openExternal(url).catch((err: unknown) => log('could not open', url, err));
    else log(`refused ${what}:`, url);
  };
  wc.setWindowOpenHandler(({ url }) => {
    openOut(url, 'external link');
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event: { preventDefault(): void }, url: string) => {
    if (isAllowedNavigation(url, o.devServerUrl)) return;
    event.preventDefault();
    openOut(url, 'navigation');
  });
  wc.on('will-redirect', (event: { preventDefault(): void }, url: string) => {
    if (!isAllowedNavigation(url, o.devServerUrl)) event.preventDefault();
  });
  const devKey = o.devToolsKey === undefined ? 'F12' : o.devToolsKey;
  wc.on('before-input-event', (event: { preventDefault(): void }, input: Parameters<typeof isDevToolsKey>[0]) => {
    if (o.packaged) {
      if (isDevToolsKey(input)) event.preventDefault();
      return;
    }
    if (devKey && input.type === 'keyDown' && input.key === devKey) {
      wc.toggleDevTools();
      event.preventDefault();
    }
  });
}

/**
 * Answers every permission request and check on `session` (camera, microphone, notifications, geolocation…) with no,
 * but those in `allow`. Chromium's default in Electron is yes to almost everything, which a game never needs.
 */
export function denyPermissions(session: SessionLike, allow: readonly string[] = []): void {
  const allowed = new Set(allow);
  session.setPermissionRequestHandler((_wc: unknown, permission: string, callback: (granted: boolean) => void) => callback(allowed.has(permission)));
  session.setPermissionCheckHandler((_wc: unknown, permission: string) => allowed.has(permission));
}

/**
 * A packaged app started with a debugger switch quits before it opens a window. Call it first thing in the main
 * process; `exit` defaults to `process.exit` — not `app.exit`, so nothing after the call may run.
 */
export function refuseDebugLaunch(app: AppLike, argv: readonly string[] = process.argv, exit: (code: number) => void = (c) => process.exit(c)): boolean {
  if (!app.isPackaged) return false;
  if (!debuggerRequested(argv, (s) => app.commandLine.hasSwitch(s))) return false;
  console.error('[main] refusing to run with a debugger attached');
  exit(1);
  return true;
}
