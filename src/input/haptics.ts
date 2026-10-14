/**
 * A buzz on a phone, per kind of moment (a crit landed, a blow taken, a level gained), rate-limited per kind: a cleave
 * clipping six bodies is one buzz, a damage-over-time one buzz, not a stutter. How it buzzes is injected: the default
 * is the Vibration API (`navigator.vibrate`, Android browsers; iOS Safari has none, so it is a silent no-op there), and
 * a native shell hands in its own plugin's call instead.
 */

/** The shortest gap (ms) between two buzzes of each kind; a kind not named is never held back. */
export type HapticGaps<K extends string> = Readonly<Partial<Record<K, number>>>;

/** One buzz per kind per its gap. Pure, so the rule is tested. */
export class HapticGate<K extends string> {
  private readonly last = new Map<K, number>();

  constructor(private readonly gaps: HapticGaps<K> = {} as HapticGaps<K>) {}

  /** Whether a buzz of `kind` at `now` (ms) may go; one that may is counted. */
  allow(kind: K, now: number): boolean {
    const prev = this.last.get(kind);
    const gap = this.gaps[kind] ?? 0;
    if (prev !== undefined && now - prev < gap) return false;
    this.last.set(kind, now);
    return true;
  }

  /** Forgets every kind's last buzz. */
  reset(): void {
    this.last.clear();
  }
}

export interface HapticsOptions<K extends string> {
  gaps?: HapticGaps<K>;
  /** Plays a buzz. A promise it returns may reject: that is swallowed, a buzz is never worth an error. */
  play?: (kind: K) => unknown;
  /** The Vibration API pattern per kind for the default `play` (ms, or on/off ms; default 15). */
  patterns?: Readonly<Partial<Record<K, number | readonly number[]>>>;
  /** Asked before every buzz (the player's setting, a native-only rule). Default: always. */
  enabled?: () => boolean;
  /** Default `performance.now`. */
  now?: () => number;
}

type VibrateNavigator = { vibrate?: (pattern: number | number[]) => boolean };

/** The default player: `navigator.vibrate`, where there is one. */
export function vibrate(pattern: number | readonly number[]): boolean {
  const nav = (typeof navigator === 'undefined' ? undefined : navigator) as VibrateNavigator | undefined;
  if (typeof nav?.vibrate !== 'function') return false;
  try {
    return nav.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
  } catch {
    return false;
  }
}

/** Buzzes through `play` when `enabled` and the kind's gap has passed. */
export class Haptics<K extends string> {
  private readonly gate: HapticGate<K>;
  private readonly play: (kind: K) => unknown;
  private readonly enabled: () => boolean;
  private readonly now: () => number;

  constructor(options: HapticsOptions<K> = {}) {
    this.gate = new HapticGate(options.gaps);
    this.play = options.play ?? ((kind) => vibrate(options.patterns?.[kind] ?? 15));
    this.enabled = options.enabled ?? (() => true);
    this.now = options.now ?? (() => performance.now());
  }

  /** Buzzes for `kind`; returns whether it was let through (not whether the device did buzz). */
  buzz(kind: K): boolean {
    if (!this.enabled() || !this.gate.allow(kind, this.now())) return false;
    try {
      const run = this.play(kind);
      if (run && typeof (run as Promise<unknown>).catch === 'function') void (run as Promise<unknown>).catch(() => {});
    } catch {
      // a plugin that throws is no reason to break the moment it was buzzing for
    }
    return true;
  }
}
