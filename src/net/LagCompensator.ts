/** A body's position at one recorded moment. */
export interface RewoundBody {
  id: number;
  x: number;
  y: number;
}

/** A body a ray passed through: `along` is how far from the ray's start it was met (px). */
export interface RewoundHit extends RewoundBody {
  along: number;
}

interface Frame {
  time: number;
  pos: Map<number, [number, number]>;
}

/**
 * Lag compensation for a server: where every body was a moment ago, so a shot is judged against what the shooter saw.
 * A client draws other bodies `delayMs` in the past between two snapshots (`InterpolationBuffer`); the server records
 * the same positions at the same times, when each snapshot goes out, and blends between them the same way, so a
 * rewind lands on the very picture the shooter aimed at, not on where the target has walked to since.
 *
 * How far back a client may ask is capped (`clampTime`): a client that claims an old time to shoot round a corner
 * gets no further back than `maxRewindMs`.
 *
 * ```ts
 * // when snapshots go out (RoomHost does this for a Room made with `rewindMs`)
 * lag.record(now, players);
 * // a client's shot, sent with `at: buffer.viewTime(serverNow())`
 * const at = LagCompensator.clampTime(msg.at, now, 250);
 * const hit = lag.alongRay(at, x, y, dx, dy, range, 6, shooterId)[0];
 * ```
 */
export class LagCompensator {
  private readonly frames: Frame[] = [];

  /** `keepMs`: how much history is kept; at least the longest rewind allowed plus a snapshot interval. */
  constructor(readonly keepMs = 1000) {}

  /** The latest recorded time, or -Infinity before any. */
  get newest(): number {
    return this.frames.length ? this.frames[this.frames.length - 1]!.time : -Infinity;
  }

  get oldest(): number {
    return this.frames.length ? this.frames[0]!.time : -Infinity;
  }

  /** Records every body's position at `time`. A time not after the last one recorded replaces that frame. */
  record(time: number, bodies: Iterable<{ readonly id: number; readonly x: number; readonly y: number }>): void {
    const pos = new Map<number, [number, number]>();
    for (const b of bodies) pos.set(b.id, [b.x, b.y]);
    const last = this.frames[this.frames.length - 1];
    if (last && time <= last.time) {
      last.pos = pos;
    } else this.frames.push({ time, pos });
    const cutoff = time - this.keepMs;
    // keep one frame at or before the cutoff, so a rewind to it still has a frame on each side
    while (this.frames.length > 2 && this.frames[1]!.time <= cutoff) this.frames.shift();
  }

  /** Forgets a body everywhere in the history (it left the game, not just the view). */
  forget(id: number): void {
    for (const f of this.frames) f.pos.delete(id);
  }

  clear(): void {
    this.frames.length = 0;
  }

  /**
   * A time a client claims it saw, kept within `[now - maxRewindMs, now]`: the window a rewind is honoured in. A
   * claim that is not a finite number is taken as `now` (no rewind).
   */
  static clampTime(claimed: unknown, now: number, maxRewindMs: number): number {
    if (typeof claimed !== 'number' || !Number.isFinite(claimed)) return now;
    return Math.min(now, Math.max(now - maxRewindMs, claimed));
  }

  /**
   * Where body `id` was at `time`, blended between the frames around it as `InterpolationBuffer` blends; null when
   * the history has no frame of it. Before the oldest frame it is where it was then; after the newest, where it is.
   */
  at(id: number, time: number): { x: number; y: number } | null {
    const span = this.around(time);
    if (!span) return null;
    return blendOf(span[0], span[1], span[2], id);
  }

  /** Every body in the history at `time`. */
  all(time: number): RewoundBody[] {
    const span = this.around(time);
    if (!span) return [];
    const [a, b, k] = span;
    const ids = new Set([...a.pos.keys(), ...b.pos.keys()]);
    const out: RewoundBody[] = [];
    for (const id of ids) {
      const p = blendOf(a, b, k, id)!;
      out.push({ id, x: p.x, y: p.y });
    }
    return out;
  }

  /** The bodies whose centre was within `radius` of (x, y) at `time`, nearest first; `except` (the shooter) left out. */
  near(time: number, x: number, y: number, radius: number, except?: number): RewoundBody[] {
    const out = this.all(time).filter((b) => b.id !== except && (b.x - x) ** 2 + (b.y - y) ** 2 <= radius * radius);
    return out.sort((p, q) => (p.x - x) ** 2 + (p.y - y) ** 2 - ((q.x - x) ** 2 + (q.y - y) ** 2));
  }

  /**
   * A hitscan at `time`: the bodies a ray from (x, y) along (dx, dy) passed within `radius` of, before `range` px, in
   * the order it met them. `except` (the shooter) is left out. Walls are the game's to check against the first hit.
   */
  alongRay(time: number, x: number, y: number, dx: number, dy: number, range: number, radius: number, except?: number): RewoundHit[] {
    const len = Math.hypot(dx, dy);
    if (len === 0) return [];
    const ux = dx / len;
    const uy = dy / len;
    const hits: RewoundHit[] = [];
    for (const b of this.all(time)) {
      if (b.id === except) continue;
      // the closest approach of the ray to the body's centre, and where along the ray it first comes within radius
      const along = (b.x - x) * ux + (b.y - y) * uy;
      const px = x + ux * along - b.x;
      const py = y + uy * along - b.y;
      const miss2 = px * px + py * py;
      if (miss2 > radius * radius) continue;
      const enter = along - Math.sqrt(radius * radius - miss2);
      if (along < -radius || enter > range) continue;
      hits.push({ id: b.id, x: b.x, y: b.y, along: Math.max(0, enter) });
    }
    return hits.sort((p, q) => p.along - q.along);
  }

  /** The two frames around `time` and how far between them it is (0 at the first, 1 at the second). */
  private around(time: number): [Frame, Frame, number] | null {
    const f = this.frames;
    if (f.length === 0) return null;
    if (time <= f[0]!.time) return [f[0]!, f[0]!, 0];
    const last = f[f.length - 1]!;
    if (time >= last.time) return [last, last, 0];
    for (let i = f.length - 1; i > 0; i--) {
      const a = f[i - 1]!;
      const b = f[i]!;
      if (time >= a.time && time <= b.time) return [a, b, b.time === a.time ? 1 : (time - a.time) / (b.time - a.time)];
    }
    return null;
  }
}

/** A body between two frames: blended when in both, else where the one frame that has it put it. */
function blendOf(a: Frame, b: Frame, k: number, id: number): { x: number; y: number } | null {
  const pa = a.pos.get(id);
  const pb = b.pos.get(id);
  if (pa && pb) return { x: pa[0] + (pb[0] - pa[0]) * k, y: pa[1] + (pb[1] - pa[1]) * k };
  const p = pa ?? pb;
  return p ? { x: p[0], y: p[1] } : null;
}
