/**
 * Every repeated player action with a timer — the basic attack, a skill's cooldown, the cast and attack locks, a
 * potion — runs on a **schedule**, not on "the last time plus some slack". An action may arrive up to its slack
 * early (network jitter bunches packets), but the next one is then due a whole interval after the later of the
 * arrival and the time this one was due, so the slack never adds up: a client sending every 0.8 of an interval
 * lands at most one per interval (67 in 100), not 100. A server must run the same arithmetic.
 */
export const CADENCE = {
  /** A basic attack may arrive this share of its interval early. */
  attackEarlyShare: 0.2,
  /** The cast lock and the attack lock a cast leaves may be cut this short. */
  lockSlackMs: 60,
  /** A skill may be cast this long before its cooldown ends. */
  cooldownSlackMs: 40,
  /** A potion may be drunk this long before its kind's cooldown ends. */
  potionSlackMs: 150,
} as const;

/** Whether an action arriving at `now` is earlier than its slack allows; `due` undefined = never taken, due at once. */
export function cadenceEarly(now: number, due: number | undefined, slack: number): boolean {
  return due !== undefined && now < due - slack;
}

/** When the action after one accepted at `now` is due: a whole interval after the later of `now` and `due`. */
export function cadenceNext(now: number, due: number | undefined, interval: number): number {
  return Math.max(now, due ?? now) + interval;
}
