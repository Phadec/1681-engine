/*
 * The few parts of Electron's main-process API this module touches, written as structural types so the engine never
 * imports or depends on `electron`: a game passes its own `app`, `safeStorage`, `ipcMain`, `shell` and windows, and
 * a test passes fakes. Each is a subset of Electron's own type, so Electron's objects fit them as they are.
 */

/** `electron.safeStorage`. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  /** Linux only: `basic_text` means a hard-coded key, which is no encryption at all. */
  getSelectedStorageBackend?(): string;
  encryptString(plainText: string): Uint8Array;
  decryptString(encrypted: Buffer): string;
}

/** `electron.ipcMain`. */
export interface IpcMainLike {
  // the arguments come from a renderer: untrusted, checked by each handler
  handle(channel: string, listener: (event: any, ...args: any[]) => unknown): void;
  removeHandler?(channel: string): void;
}

/** `electron.shell`. */
export interface ShellLike {
  openExternal(url: string): Promise<void>;
}

/** What `before-input-event` hands a listener (`Electron.Input`). */
export interface InputLike {
  type: string;
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

/** An event a listener may cancel. */
export interface PreventableLike {
  preventDefault(): void;
}

/** `electron.Session`, for the permission handlers. */
export interface SessionLike {
  setPermissionRequestHandler(handler: ((webContents: any, permission: any, callback: (granted: boolean) => void, details: any) => void) | null): void;
  setPermissionCheckHandler(handler: ((webContents: any, permission: any, requestingOrigin: string, details: any) => boolean) | null): void;
}

/** `electron.WebContents`. */
export interface WebContentsLike {
  setWindowOpenHandler(handler: (details: { url: string }) => any): void;
  // Electron's `on` is overloaded per event; the module listens on `will-navigate`, `will-redirect` and
  // `before-input-event` with the arguments Electron documents for each
  on(event: any, listener: (...args: any[]) => void): unknown;
  toggleDevTools(): void;
  session?: SessionLike;
}

/** `electron.BrowserWindow`, as far as a lockdown needs it. */
export interface WindowLike {
  webContents: WebContentsLike;
}

/** `electron.app`, as far as the debugger refusal needs it. */
export interface AppLike {
  isPackaged: boolean;
  commandLine: { hasSwitch(name: string): boolean };
}
