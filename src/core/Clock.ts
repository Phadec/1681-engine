import { runDue } from './runDue';

/** A one-shot timer; it is its own handle, so scheduling one makes one object and its `remove`. */
class Timer {
  removed = false;
  /** An arrow, so a handle's `remove` still works when taken off it (`const { remove } = …`). */
  readonly remove = (): void => {
    this.removed = true;
  };

  constructor(
    readonly at: number,
    readonly fn: () => void,
  ) {}
}

/**
 * Scene time and one-shot timers, advanced by the frame loop.
 *
 * `update` allocates nothing (`runDue`): a game scheduling effect beats every few milliseconds made two filtered
 * arrays a frame. A timer that throws is reported to `onError` and dropped, and the others due that frame still run.
 */
export class Clock {
  now = performance.now();
  /** Told of every error a timer throws (default: logged). `Stage` routes it into its guarded-step reporting. */
  onError: (err: unknown) => void = (err) => console.error('[timer] failed', err);
  private readonly timers: Timer[] = [];
  private readonly due: Timer[] = [];
  /** Made once, so `update` hands `runDue` no fresh closure; reads `onError` late so it may be swapped any time. */
  private readonly report = (err: unknown): void => this.onError(err);

  delayedCall(ms: number, fn: () => void): { remove: () => void } {
    const t = new Timer(this.now + ms, fn);
    this.timers.push(t);
    return t;
  }

  /** Timers waiting to run (removed ones not yet swept included). */
  get pending(): number {
    return this.timers.length;
  }

  update(now: number): void {
    this.now = now;
    runDue(this.timers, this.due, now, this.report);
  }

  clear(): void {
    // a clear from inside a timer also stops the ones still due this frame
    for (const t of this.due) t.removed = true;
    this.timers.length = 0;
  }
}
