import type { SaveStore } from './SaveStore';

/** The clock and timers the autosaver uses; tests hand in fake ones. */
export interface AutosaveTimers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AutosaverOptions {
  /** Least time between two saves, ms (default 30,000). */
  intervalMs?: number;
  /** Small summary stored beside each save (see `SaveStore.save`). */
  meta?: () => unknown;
  /** Told when a save fails; autosaving carries on. */
  onError?: (err: unknown) => void;
  timers?: AutosaveTimers;
}

const REAL_TIMERS: AutosaveTimers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Saves a slot when the game says something changed, but never more often than `intervalMs`: a burst of changes
 * (every pickup in a fight) becomes one save now and one trailing save at the end of the interval with the newest
 * state. `snapshot` is read when the save happens, not when it was asked for, so the trailing save is never stale.
 */
export class Autosaver {
  private readonly intervalMs: number;
  private readonly timers: AutosaveTimers;
  private lastSave = -Infinity;
  private dirty = false;
  private timer: unknown = null;
  private inFlight: Promise<void> | null = null;
  private disposed = false;

  constructor(
    private readonly store: SaveStore,
    private readonly slot: string,
    private readonly snapshot: () => unknown,
    private readonly options: AutosaverOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 30_000;
    this.timers = options.timers ?? REAL_TIMERS;
  }

  /** Something worth saving changed. */
  request(): void {
    if (this.disposed) return;
    this.dirty = true;
    if (this.timer !== null || this.inFlight) return;
    const wait = this.lastSave + this.intervalMs - this.timers.now();
    if (wait <= 0) void this.run();
    else this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, wait);
  }

  /** Saves now if anything is waiting (leaving the game, a scene change); resolves when it is written. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight) await this.inFlight;
    if (this.dirty) await this.run();
  }

  /** Stops autosaving; a pending trailing save is dropped (call `flush` first to keep it). */
  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  private run(): Promise<void> {
    this.dirty = false;
    this.lastSave = this.timers.now();
    const job = (async () => {
      try {
        await this.store.save(this.slot, this.snapshot(), this.options.meta?.() ?? null);
      } catch (err) {
        if (this.options.onError) this.options.onError(err);
        else console.error('[autosave] failed', err);
      }
    })();
    this.inFlight = job;
    void job.then(() => {
      this.inFlight = null;
      // changes made while the save was being written wait for the next interval
      if (this.dirty && !this.disposed) {
        this.dirty = false;
        this.request();
      }
    });
    return job;
  }
}
