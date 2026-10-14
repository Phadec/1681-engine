/**
 * Picking and holding a target on a touch screen, kept pure so it can be tested. Dragging an attack button points:
 * the body lying closest to that direction is picked (and of two about as close to it, the nearer). A target button
 * picks the nearest. The lock then holds — every attack, skill and the facing goes at it, even while a stick walks
 * the body elsewhere — until that body is gone or leaves `keepRange`; a later drag that points at nothing keeps it.
 *
 * Bodies come from a callback as `{ id, x, y }`: the game decides what may be locked (monsters, a duel's opponent).
 */

export interface LockBody {
  id: number;
  x: number;
  y: number;
}

type Point = { x: number; y: number };

export const LOCK_PICK_RANGE = 220;
export const LOCK_KEEP_RANGE = 300;
/** Widest angle off the drag a body may stand and still be picked: 50° each side. */
export const LOCK_PICK_CONE = (50 * Math.PI) / 180;

/** The signed difference a − b, wrapped into −π…π. */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * The body a drag in direction `dir` (any length > 0) picks from `from`, or null. Scored by how far off the drag's
 * line it stands, with distance as a lighter second weight, so a far body dead ahead beats a near one off to the side.
 */
export function pickTarget(from: Point, dir: Point, bodies: readonly LockBody[], range = LOCK_PICK_RANGE, cone = LOCK_PICK_CONE): number | null {
  const len = Math.hypot(dir.x, dir.y);
  if (len < 1e-6) return null;
  const heading = Math.atan2(dir.y, dir.x);
  let best: number | null = null;
  let bestScore = Infinity;
  for (const b of bodies) {
    const d = Math.hypot(b.x - from.x, b.y - from.y);
    if (d > range) continue;
    // a body right on top of the player is in every direction
    const off = d < 1 ? 0 : Math.abs(angleDiff(Math.atan2(b.y - from.y, b.x - from.x), heading));
    if (off > cone) continue;
    const score = off / cone + (0.35 * d) / range;
    if (score < bestScore) {
      bestScore = score;
      best = b.id;
    }
  }
  return best;
}

/** The nearest body within `range` (ties to the lower id, so two clients pick alike), or null. */
export function nearestTarget(from: Point, bodies: readonly LockBody[], range = LOCK_PICK_RANGE): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const b of bodies) {
    const d = Math.hypot(b.x - from.x, b.y - from.y);
    if (d > range) continue;
    if (d < bestD || (d === bestD && best !== null && b.id < best)) {
      bestD = d;
      best = b.id;
    }
  }
  return best;
}

/** The locked body while the lock still holds (present, within `range`), else null. */
export function keptTarget<T extends LockBody>(from: Point, locked: number | null, bodies: readonly T[], range = LOCK_KEEP_RANGE): T | null {
  if (locked === null) return null;
  const b = bodies.find((c) => c.id === locked);
  if (!b || Math.hypot(b.x - from.x, b.y - from.y) > range) return null;
  return b;
}

export interface TargetLockOptions {
  pickRange?: number;
  keepRange?: number;
  /** Half-angle (radians) a drag picks within. */
  cone?: number;
}

/** The lock as state: which body is held, picked by a drag or the nearest, let go when it is gone or too far. */
export class TargetLock<T extends LockBody = LockBody> {
  private id: number | null = null;
  private readonly pickRange: number;
  private readonly keepRange: number;
  private readonly cone: number;

  constructor(
    private readonly bodies: () => readonly T[],
    options: TargetLockOptions = {},
  ) {
    this.pickRange = options.pickRange ?? LOCK_PICK_RANGE;
    this.keepRange = options.keepRange ?? LOCK_KEEP_RANGE;
    this.cone = options.cone ?? LOCK_PICK_CONE;
  }

  /** The id held, without checking it still stands (use `current` for that). */
  get locked(): number | null {
    return this.id;
  }

  /** A drag in `dir` from `from`: locks what it points at; pointing at nothing keeps the old lock. */
  pick(from: Point, dir: Point): number | null {
    const id = pickTarget(from, dir, this.bodies(), this.pickRange, this.cone);
    if (id !== null) this.id = id;
    return this.id;
  }

  /** Locks the nearest body, every call, whatever was held. */
  pickNearest(from: Point): number | null {
    this.id = nearestTarget(from, this.bodies(), this.pickRange);
    return this.id;
  }

  /** The held body if it still holds; a lock that no longer does is dropped. */
  current(from: Point): T | null {
    const b = keptTarget(from, this.id, this.bodies(), this.keepRange);
    if (!b) this.id = null;
    return b;
  }

  clear(): void {
    this.id = null;
  }
}
