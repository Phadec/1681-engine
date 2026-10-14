/** Something to run at a time: a timer, an effect's later beat. `removed` ones are dropped without running. */
export interface DueCall {
  at: number;
  fn: () => void;
  removed?: boolean;
}

/**
 * Runs and removes every call of `scheduled` due by `now`, in place: the list is compacted and `scratch` (kept by the
 * caller, empty between calls) collects the due ones, so a frame allocates nothing. A call that throws goes to
 * `failed` and the rest still run; whatever happens the due calls are gone from both lists afterwards. A list that
 * kept a thrower threw again every frame anything else was scheduled, and cut short whatever the frame ran after it.
 * A call scheduled by a running one lands in `scheduled` and waits for the next pass, even if already due.
 */
export function runDue<T extends DueCall>(scheduled: T[], scratch: T[], now: number, failed: (err: unknown) => void): void {
  let keep = 0;
  for (let i = 0; i < scheduled.length; i++) {
    const s = scheduled[i]!;
    if (s.removed) continue;
    if (s.at <= now) scratch.push(s);
    else scheduled[keep++] = s;
  }
  scheduled.length = keep;
  if (!scratch.length) return;
  try {
    for (let i = 0; i < scratch.length; i++) {
      const s = scratch[i]!;
      // removed by an earlier call of this same pass
      if (s.removed) continue;
      try {
        s.fn();
      } catch (err) {
        try {
          failed(err);
        } catch (report) {
          // a broken reporter must not cost the calls after it their turn
          console.error('[runDue] error handler failed', report);
        }
      }
    }
  } finally {
    scratch.length = 0;
  }
}
