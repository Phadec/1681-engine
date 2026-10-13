interface Timer {
  at: number;
  fn: () => void;
  removed: boolean;
}

/** Scene time and one-shot timers, advanced by the frame loop. */
export class Clock {
  now = performance.now();
  private timers: Timer[] = [];

  delayedCall(ms: number, fn: () => void): { remove: () => void } {
    const t: Timer = { at: this.now + ms, fn, removed: false };
    this.timers.push(t);
    return { remove: () => void (t.removed = true) };
  }

  update(now: number): void {
    this.now = now;
    const due = this.timers.filter((t) => !t.removed && t.at <= now);
    if (!due.length) return;
    this.timers = this.timers.filter((t) => !t.removed && t.at > now);
    for (const t of due) {
      // one timer that throws does not take the others due this frame with it
      try {
        t.fn();
      } catch (err) {
        console.error('[timer] failed', err);
      }
    }
  }

  clear(): void {
    this.timers = [];
  }
}
