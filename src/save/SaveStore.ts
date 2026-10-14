import { checksum } from './checksum';
import { MemoryBackend } from './MemoryBackend';
import { MigrationError, migrateSave, type Migrations } from './migrateSave';
import type { SaveBackend } from './SaveBackend';
import { WebStorageBackend } from './WebStorageBackend';

export interface SaveStoreOptions {
  /** The schema version this build writes; older saves go through `migrations` on load. */
  version: number;
  /** `migrations[n]` turns data of version n into version n + 1. */
  migrations?: Migrations;
  /** Where slots are kept (default `localStorage`, or memory where there is none). */
  backend?: SaveBackend;
  /** Prepended to every slot's key, so two games (or a game and its tools) on one origin never share slots. */
  prefix?: string;
  /** Keep the slot's previous good save beside it and fall back to it when the slot is corrupt (default true). */
  backup?: boolean;
  /** Wall clock for `savedAt` (default `Date.now`). */
  now?: () => number;
}

/** What a slot holds besides the game's data: shown on a load screen without loading the save. */
export interface SaveInfo {
  slot: string;
  version: number;
  savedAt: number;
  /** Whatever small summary the game passed to `save` (level reached, play time, a title). */
  meta: unknown;
}

export type LoadFailure = 'missing' | 'corrupt' | 'too-new' | 'no-migration' | 'migration-failed';

export type LoadResult<T> =
  | { ok: true; data: T; info: SaveInfo; migrated: boolean; fromBackup: boolean }
  | { ok: false; slot: string; reason: LoadFailure; error?: unknown };

/** The stored form. `format` marks it as ours; `checksum` covers the JSON of `data`. */
interface Envelope {
  format: 'lantern-save';
  version: number;
  savedAt: number;
  meta: unknown;
  checksum: string;
  data: unknown;
}

const BACKUP = '.bak';

/**
 * Named save slots with a schema version, migrations from older versions, a checksum to catch a damaged slot, and a
 * backup of the previous save to fall back to. Data must be JSON-safe (plain objects, arrays, strings, finite
 * numbers, booleans, null).
 *
 * ```ts
 * const saves = new SaveStore({ version: 3, migrations: { 1: addInventory, 2: renameGold } });
 * await saves.save('slot1', state, { level: 4 });
 * const r = await saves.load<GameState>('slot1');
 * if (r.ok) start(r.data); else if (r.reason !== 'missing') warn(r.reason);
 * ```
 *
 * Writes to one slot are queued in order, so an autosave and a manual save never land the wrong way round.
 */
export class SaveStore {
  readonly version: number;
  private readonly backend: SaveBackend;
  private readonly prefix: string;
  private readonly migrations: Migrations;
  private readonly backup: boolean;
  private readonly now: () => number;
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(options: SaveStoreOptions) {
    if (!Number.isInteger(options.version) || options.version < 1) throw new Error('SaveStore: version must be a whole number from 1');
    this.version = options.version;
    this.backend = options.backend ?? defaultBackend();
    this.prefix = options.prefix ?? 'save:';
    this.migrations = options.migrations ?? {};
    this.backup = options.backup ?? true;
    this.now = options.now ?? Date.now;
  }

  /** Writes `data` to `slot` at the current version. Rejects when the backend does (a full disk, a quota). */
  save(slot: string, data: unknown, meta: unknown = null): Promise<SaveInfo> {
    return this.queued(slot, async () => {
      const key = this.key(slot);
      const json = JSON.stringify(data);
      if (json === undefined) throw new Error(`SaveStore: data for "${slot}" is not JSON`);
      const info: SaveInfo = { slot, version: this.version, savedAt: this.now(), meta };
      const envelope: Envelope = { format: 'lantern-save', version: info.version, savedAt: info.savedAt, meta, checksum: checksum(json), data };
      if (this.backup) {
        // only a save that still reads is worth keeping: a damaged one would overwrite the good backup
        const previous = await this.backend.read(key);
        if (previous !== null && verify(previous)) await this.backend.write(key + BACKUP, previous);
      }
      await this.backend.write(key, JSON.stringify(envelope));
      return info;
    });
  }

  /** Reads `slot`, brought to the current version. Never throws for a bad slot: the result says what went wrong. */
  load<T>(slot: string): Promise<LoadResult<T>> {
    return this.queued(slot, async () => {
      const key = this.key(slot);
      const main = await this.open<T>(slot, await this.backend.read(key), false);
      if (main.ok || !this.backup || main.reason !== 'corrupt') return main;
      const backup = await this.open<T>(slot, await this.backend.read(key + BACKUP), true);
      return backup.ok ? backup : main;
    });
  }

  /** Removes a slot and its backup. */
  delete(slot: string): Promise<void> {
    return this.queued(slot, async () => {
      const key = this.key(slot);
      await this.backend.remove(key);
      await this.backend.remove(key + BACKUP);
    });
  }

  /** Every slot that reads, newest first, without migrating its data. A damaged slot is left out. */
  async list(): Promise<SaveInfo[]> {
    const keys = await this.backend.keys(this.prefix);
    const out: SaveInfo[] = [];
    for (const key of keys) {
      if (key.endsWith(BACKUP)) continue;
      const raw = await this.backend.read(key);
      const env = raw === null ? null : parse(raw);
      if (env && verify(raw!)) out.push({ slot: key.slice(this.prefix.length), version: env.version, savedAt: env.savedAt, meta: env.meta });
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  }

  private async open<T>(slot: string, raw: string | null, fromBackup: boolean): Promise<LoadResult<T>> {
    if (raw === null) return { ok: false, slot, reason: fromBackup ? 'corrupt' : 'missing' };
    const env = parse(raw);
    if (!env || checksum(JSON.stringify(env.data)) !== env.checksum) return { ok: false, slot, reason: 'corrupt' };
    try {
      const data = migrateSave(env.data, env.version, this.version, this.migrations) as T;
      const info: SaveInfo = { slot, version: env.version, savedAt: env.savedAt, meta: env.meta };
      return { ok: true, data, info, migrated: env.version !== this.version, fromBackup };
    } catch (err) {
      if (err instanceof MigrationError) return { ok: false, slot, reason: err.reason, error: err };
      throw err;
    }
  }

  private key(slot: string): string {
    if (!slot || slot.endsWith(BACKUP)) throw new Error(`SaveStore: "${slot}" is not a usable slot name`);
    return this.prefix + slot;
  }

  private queued<R>(slot: string, job: () => Promise<R>): Promise<R> {
    const run = (this.queues.get(slot) ?? Promise.resolve()).then(job);
    const tail = run.catch(() => undefined);
    this.queues.set(slot, tail);
    // forget the chain once it is idle, or a game with many slots keeps a promise per slot for good
    void tail.then(() => {
      if (this.queues.get(slot) === tail) this.queues.delete(slot);
    });
    return run;
  }
}

function parse(raw: string): Envelope | null {
  try {
    const v = JSON.parse(raw) as Partial<Envelope> | null;
    if (!v || v.format !== 'lantern-save' || typeof v.version !== 'number' || typeof v.checksum !== 'string' || !('data' in v)) return null;
    return v as Envelope;
  } catch {
    return null;
  }
}

function verify(raw: string): boolean {
  const env = parse(raw);
  return env !== null && checksum(JSON.stringify(env.data)) === env.checksum;
}

function defaultBackend(): SaveBackend {
  try {
    if (typeof globalThis.localStorage !== 'undefined') return new WebStorageBackend(globalThis.localStorage);
  } catch {
    // a sandboxed frame throws on merely reading localStorage
  }
  return new MemoryBackend();
}
