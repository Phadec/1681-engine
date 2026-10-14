import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { IpcMainLike, SafeStorageLike } from './electronLike';

/** Where and how a {@link SessionStore} keeps its one secret. */
export interface SessionStoreOptions {
  /** `electron.safeStorage`. */
  safeStorage: SafeStorageLike;
  /** The folder, e.g. `app.getPath('userData')` — a second app (a test build) with its own user data keeps its own. */
  dir: string;
  /** Default `session.bin`. */
  fileName?: string;
  /** Longest value accepted, in characters. Default 4096: a saved login is a token and a name, never a blob. */
  maxLength?: number;
  /** Default `process.platform`. */
  platform?: string;
}

/**
 * One small secret (a refresh token and username, as a JSON string) kept for "stay logged in", encrypted by the OS —
 * `safeStorage`: DPAPI for the Windows user, the Keychain on the Mac. Where the OS offers no real encryption (Linux
 * without a keyring: `basic_text`, a key written into Chromium) nothing is written and the player logs in again after
 * closing; a token on disk in the clear is worse than that. Never `localStorage`: any script in the page could read it.
 */
export class SessionStore {
  private readonly file: string;
  private readonly maxLength: number;
  private readonly platform: string;

  constructor(private readonly o: SessionStoreOptions) {
    this.file = join(o.dir, o.fileName ?? 'session.bin');
    this.maxLength = o.maxLength ?? 4096;
    this.platform = o.platform ?? process.platform;
  }

  /** Whether the OS can encrypt for real here. */
  canEncrypt(): boolean {
    const s = this.o.safeStorage;
    if (!s.isEncryptionAvailable()) return false;
    return this.platform !== 'linux' || s.getSelectedStorageBackend?.() !== 'basic_text';
  }

  /** The saved value, or null when there is none, it cannot be decrypted (another OS user, a reinstall) or nothing may be. */
  async get(): Promise<string | null> {
    if (!this.canEncrypt()) return null;
    try {
      return this.o.safeStorage.decryptString(await fs.readFile(this.file));
    } catch {
      return null;
    }
  }

  /** Saves `value`; false when it is not a string, too long, or the OS cannot encrypt it. */
  async set(value: unknown): Promise<boolean> {
    if (typeof value !== 'string' || value.length > this.maxLength || !this.canEncrypt()) return false;
    // written beside it and renamed over it, so a crash or a second write mid-way never leaves half a file
    const temp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.mkdir(this.o.dir, { recursive: true });
      await fs.writeFile(temp, this.o.safeStorage.encryptString(value));
      await fs.rename(temp, this.file);
    } catch (err) {
      await fs.rm(temp, { force: true });
      throw err;
    }
    return true;
  }

  async clear(): Promise<void> {
    await fs.rm(this.file, { force: true });
  }
}

/**
 * Answers a renderer's `<prefix>:get`, `<prefix>:set` (one string) and `<prefix>:clear` from `store`, so the page only
 * ever sees the plain value, and only its own. Expose them in the preload with `ipcRenderer.invoke`. Returns a function
 * that removes the handlers.
 */
export function registerSessionStore(ipcMain: IpcMainLike, store: SessionStore, prefix = 'session'): () => void {
  ipcMain.handle(`${prefix}:get`, () => store.get());
  ipcMain.handle(`${prefix}:set`, (_e: unknown, value: unknown) => store.set(value));
  ipcMain.handle(`${prefix}:clear`, () => store.clear());
  return () => {
    for (const c of ['get', 'set', 'clear']) ipcMain.removeHandler?.(`${prefix}:${c}`);
  };
}
