/**
 * Where save slots are kept. Asynchronous so a game can plug in IndexedDB, a file through Electron, or a native
 * key–value store (Capacitor Preferences, a secure store) behind the same `SaveStore`; the synchronous ones
 * (`WebStorageBackend`, `MemoryBackend`) simply answer at once.
 */
export interface SaveBackend {
  /** The text stored under `key`, or null when there is none. */
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Every stored key starting with `prefix`. */
  keys(prefix: string): Promise<string[]>;
}
