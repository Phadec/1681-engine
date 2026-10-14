import { MemoryBackend, SaveStore, WebStorageBackend, type Migrations, type SaveBackend } from '../../src';

/** What the game keeps between visits, as this build writes it (schema version 2). */
export interface ProgressData {
  /** Fastest clear, ms; null before the first. */
  bestMs: number | null;
  /** Most coins taken in one clear. */
  bestCoins: number;
  /** Every coin ever taken, across runs. */
  totalCoins: number;
  language: string;
}

/** Version 1, as the first build wrote it: only the best time, in seconds. Kept to show what the migration reads. */
interface ProgressV1 {
  best: number | null;
}

/**
 * `migrations[n]` turns version n into n + 1, so a save from any older build is walked forward step by step. Version
 * 2 counted coins and remembered the language, and measured time in ms: a v1 save keeps its record, converted.
 */
const MIGRATIONS: Migrations = {
  1: (data) => {
    const v1 = data as ProgressV1;
    const v2: ProgressData = { bestMs: v1.best === null ? null : Math.round(v1.best * 1000), bestCoins: 0, totalCoins: 0, language: 'en' };
    return v2;
  },
};

const PREFIX = 'platformer:';
const SLOT = 'progress';
const FRESH: ProgressData = { bestMs: null, bestCoins: 0, totalCoins: 0, language: 'en' };

function storage(): SaveBackend {
  try {
    return new WebStorageBackend(localStorage);
  } catch {
    // a sandboxed frame has no localStorage: the game still runs, it just forgets on reload
    return new MemoryBackend();
  }
}

/** The save slot behind a small API: load once at boot, record a clear, remember the language. */
export class Progress {
  private readonly store: SaveStore;
  private readonly backend = storage();
  data: ProgressData = { ...FRESH };

  constructor() {
    this.store = new SaveStore({ version: 2, migrations: MIGRATIONS, backend: this.backend, prefix: PREFIX });
  }

  /** Reads the slot. A missing slot is a first visit; a broken one is reported and started over. */
  async load(): Promise<void> {
    // `?v1` writes a save the way the first build did, so the migration can be watched running
    if (new URLSearchParams(location.search).has('v1')) {
      const old: ProgressV1 = { best: 42.5 };
      await new SaveStore({ version: 1, backend: this.backend, prefix: PREFIX }).save(SLOT, old);
    }
    const r = await this.store.load<ProgressData>(SLOT);
    if (r.ok) {
      this.data = { ...FRESH, ...r.data };
      if (r.migrated) console.info(`[save] migrated progress from version ${r.info.version}`);
      if (r.fromBackup) console.warn('[save] the slot was damaged; read its backup');
    } else if (r.reason !== 'missing') console.warn(`[save] could not read progress (${r.reason}); starting fresh`);
  }

  /** A clear: keeps the better record. Returns whether the time is a new best. */
  recordClear(ms: number, coins: number): boolean {
    const best = this.data.bestMs === null || ms < this.data.bestMs;
    if (best) this.data.bestMs = ms;
    this.data.bestCoins = Math.max(this.data.bestCoins, coins);
    this.save();
    return best;
  }

  addCoins(n: number): void {
    this.data.totalCoins += n;
  }

  setLanguage(language: string): void {
    this.data.language = language;
    this.save();
  }

  save(): void {
    // the meta is what a load screen would show without loading the save
    this.store.save(SLOT, this.data, { bestMs: this.data.bestMs }).catch((err) => console.warn('[save] write failed', err));
  }
}

/** `m:ss.cc` for a time in ms. */
export function formatTime(ms: number): string {
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
