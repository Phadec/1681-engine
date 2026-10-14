/**
 * `1681-engine/electron`: the main-process side of a desktop build on Electron — file-by-file web patching from a
 * release store, the shell's identity, an OS-encrypted session store and a window lockdown. Electron is an optional
 * peer: nothing here imports it, the game hands in its own `app`, `safeStorage`, `ipcMain`, `shell` and windows. Runs
 * in the main process only (it uses Node's `fs` and `crypto`); the pure rules it shares with browsers and phones are
 * `1681-engine/updates`. Importable from ESM (`import`) and from a CommonJS main process (`require`).
 */
export type { SafeStorageLike, IpcMainLike, ShellLike, InputLike, PreventableLike, SessionLike, WebContentsLike, WindowLike, AppLike } from './electronLike';
export { shellId, type ShellIdOptions } from './shellId';
export { WebPatcher, type WebPatcherOptions } from './webPatcher';
export type { WebPointer, PointerName } from './webPointers';
export { SessionStore, registerSessionStore, type SessionStoreOptions } from './sessionStore';
export { isAllowedExternal, isAllowedNavigation, isDevToolsKey, debuggerRequested, DEBUG_SWITCHES, type ExternalPolicy } from './lockdownRules';
export { lockDownWindow, denyPermissions, refuseDebugLaunch, type LockdownOptions } from './lockdown';
