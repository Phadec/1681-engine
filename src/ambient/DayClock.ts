/**
 * A time of day read off a wall clock, so every client that agrees on the time (`serverNow`) stands in the same dusk
 * without a packet between them. Pure: no Pixi, no clock of its own — the caller hands in the time, and what draws
 * the night (a `LightLayer`, the pixel `NightShade`) or a HUD badge reads what this returns.
 *
 * ```ts
 * const clock = new DayClock({
 *   periodMs: 2 * 3600_000, // a game day every two real hours
 *   keys: [
 *     { at: 0, color: 0x0a1030, alpha: 0.52 },
 *     { at: 0.3, color: 0xfff0d8, alpha: 0 },
 *     { at: 0.7, color: 0xffb070, alpha: 0 },
 *     { at: 0.86, color: 0x0a1030, alpha: 0.52 },
 *   ],
 *   phases: [{ id: 'dawn', from: 0.2 }, { id: 'day', from: 0.3 }, { id: 'dusk', from: 0.7 }, { id: 'night', from: 0.8 }],
 * });
 * const day = clock.at(serverNow()); // { phase, id, color, alpha, night }
 * ```
 *
 * Phase 0 is midnight and 0.5 noon. Keys are the grade laid over the outdoor world at points of the day, mixed
 * between neighbours; a key at 0 and one at 1 with the same values make midnight seamless.
 */

/** The world's grade at one point of the day: its colour (0xRRGGBB) and how strongly it is laid (0 by day). */
export interface DayKey {
  at: number;
  color: number;
  alpha: number;
}

/** A named part of the day starting at `from` (0..1); the last one runs on through midnight. */
export interface DayPhase<P extends string = string> {
  id: P;
  from: number;
}

export interface DayClockOptions<P extends string = string> {
  /** Real milliseconds a whole game day lasts. */
  periodMs: number;
  /** Shifts the day against the wall clock (the same offset on every client keeps them together). */
  offsetMs?: number;
  /** At least one key. */
  keys: readonly DayKey[];
  /** Optional names for parts of the day; without them `id` is ''. */
  phases?: readonly DayPhase<P>[];
}

export interface DayState<P extends string = string> {
  /** 0..1 through the game day: 0 midnight, 0.5 noon. */
  phase: number;
  /** The part of the day `phase` falls in. */
  id: P | '';
  /** The grade over the outdoor world, 0xRRGGBB. */
  color: number;
  /** How strongly the grade is laid (0 at full day). */
  alpha: number;
  /** 0 by day, 1 at the darkest key: how much lamps matter. */
  night: number;
}

/** `a` taken `t` of the way to `b`, per channel, 0xRRGGBB. */
export function mixRgb(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export class DayClock<P extends string = string> {
  private readonly periodMs: number;
  private readonly offsetMs: number;
  private readonly keys: DayKey[];
  private readonly phases: DayPhase<P>[];
  private readonly maxAlpha: number;
  /** A phase held still (a debug command, a cut scene at midnight); null follows the clock. */
  private held: number | null = null;

  constructor(options: DayClockOptions<P>) {
    if (!(options.periodMs > 0)) throw new Error('DayClock: periodMs must be above 0');
    if (!options.keys.length) throw new Error('DayClock: at least one key');
    this.periodMs = options.periodMs;
    this.offsetMs = options.offsetMs ?? 0;
    this.keys = [...options.keys].sort((a, b) => a.at - b.at);
    this.phases = [...(options.phases ?? [])].sort((a, b) => a.from - b.from);
    // a clock whose darkest key is barely dark still reaches night 1 there, and one with no dark never divides by 0
    this.maxAlpha = Math.max(0.01, ...this.keys.map((k) => k.alpha));
  }

  /** Holds the day at `phase` (0..1), or lets it run again with null. */
  hold(phase: number | null): void {
    this.held = phase === null ? null : ((phase % 1) + 1) % 1;
  }

  /** Where the day stands at wall time `ms` (0..1). */
  phaseAt(ms: number): number {
    if (this.held !== null) return this.held;
    const p = this.periodMs;
    return ((((ms + this.offsetMs) % p) + p) % p) / p;
  }

  at(ms: number): DayState<P> {
    const phase = this.phaseAt(ms);
    const keys = this.keys;
    let key = keys[0]!;
    let color = key.color;
    let alpha = key.alpha;
    // past the last key it holds; before the first it holds the first
    if (phase >= keys[keys.length - 1]!.at) {
      key = keys[keys.length - 1]!;
      color = key.color;
      alpha = key.alpha;
    }
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i]!;
      const b = keys[i + 1]!;
      if (phase < a.at || phase > b.at) continue;
      const t = b.at > a.at ? (phase - a.at) / (b.at - a.at) : 0;
      color = mixRgb(a.color, b.color, t);
      alpha = a.alpha + (b.alpha - a.alpha) * t;
      break;
    }
    // the stretch before the first `from` belongs to the last phase: night runs through midnight
    let id: P | '' = this.phases.length ? this.phases[this.phases.length - 1]!.id : '';
    for (const ph of this.phases) if (phase >= ph.from) id = ph.id;
    return { phase, id, color, alpha, night: Math.min(1, alpha / this.maxAlpha) };
  }
}

/** A day's phase as a 24-hour clock, "HH:MM" (phase 0 is midnight). */
export function clockText(phase: number): string {
  const minutes = Math.floor((((phase % 1) + 1) % 1) * 24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * The night's colour pulled toward a place's own (a marsh mossy, a wood blue) as it deepens: `share` of the way at
 * full night, nothing by day.
 */
export function tintNight(day: Pick<DayState, 'color' | 'night'>, tint: number | undefined, share = 0.6): number {
  return tint === undefined ? day.color : mixRgb(day.color, tint, day.night * share);
}
