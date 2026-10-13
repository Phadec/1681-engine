import type { EntityUpdate } from './constants';

/** One body's state at one server time. */
interface Sample {
  time: number;
  x: number;
  y: number;
  aim: number;
  anim: number;
  hp: number;
  flags: number;
}

export interface InterpolatedState {
  x: number;
  y: number;
  aim: number;
  /** Discrete fields come from the older of the two samples until the newer one is reached. */
  anim: number;
  hp: number;
  flags: number;
}

/**
 * Smooth motion for bodies the server moves (other players, monsters): snapshots arrive 10–30 times a second and
 * jittered, so each body is drawn a little in the past (`delayMs`) between the two snapshots around that moment.
 * Past the newest snapshot it extrapolates for at most `maxExtrapolateMs`, then holds.
 *
 * Times are server times (`Snapshot.time`); render at `serverNow()`.
 */
export class InterpolationBuffer {
  private readonly samples = new Map<number, Sample[]>();

  constructor(
    /** How far in the past bodies are drawn (default 100 ms: two snapshots at 20 Hz, so one may be late). */
    readonly delayMs = 100,
    private readonly maxExtrapolateMs = 120,
    private readonly keep = 30,
  ) {}

  /** Records every body of a snapshot taken at `time`. */
  push(time: number, updates: readonly EntityUpdate[]): void {
    for (const [id, x, y, aim, anim, hp, flags] of updates) {
      let list = this.samples.get(id);
      if (!list) {
        list = [];
        this.samples.set(id, list);
      }
      const last = list[list.length - 1];
      // out of order or repeated: a newer sample is already here
      if (last && time <= last.time) continue;
      list.push({ time, x, y, aim, anim, hp, flags });
      if (list.length > this.keep) list.splice(0, list.length - this.keep);
    }
  }

  /** Forgets a body (it left view). */
  remove(id: number): void {
    this.samples.delete(id);
  }

  has(id: number): boolean {
    return this.samples.has(id);
  }

  ids(): IterableIterator<number> {
    return this.samples.keys();
  }

  /** Where body `id` should be drawn at server time `now`, or null if nothing is known of it. */
  sample(id: number, now: number): InterpolatedState | null {
    const list = this.samples.get(id);
    if (!list || list.length === 0) return null;
    const t = now - this.delayMs;
    const first = list[0]!;
    if (t <= first.time || list.length === 1) return pick(first);
    for (let i = list.length - 1; i > 0; i--) {
      const a = list[i - 1]!;
      const b = list[i]!;
      if (t >= a.time && t <= b.time) {
        const k = b.time === a.time ? 1 : (t - a.time) / (b.time - a.time);
        return blend(a, b, k);
      }
    }
    // newer than every sample: carry on along the last motion, for a short while only
    const a = list[list.length - 2]!;
    const b = list[list.length - 1]!;
    const over = Math.min(t - b.time, this.maxExtrapolateMs);
    const k = b.time === a.time ? 1 : 1 + over / (b.time - a.time);
    return blend(a, b, k);
  }
}

function pick(s: Sample): InterpolatedState {
  return { x: s.x, y: s.y, aim: s.aim, anim: s.anim, hp: s.hp, flags: s.flags };
}

function blend(a: Sample, b: Sample, k: number): InterpolatedState {
  let d = b.aim - a.aim;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  const older = k < 1 ? a : b;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, aim: a.aim + d * k, anim: older.anim, hp: older.hp, flags: older.flags };
}
