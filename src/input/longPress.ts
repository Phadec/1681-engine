/**
 * A long press, as pure timing so it can be tested: a finger that stays down `ms` without moving more than `slop`
 * CSS px fires once, where it went down. A second finger, a move past the slop or a lift before the time is up is
 * not a long press — a tap stays a tap. The caller owns the clock (`fire(now)` from a timer or a frame).
 */
export class LongPress {
  private finger: { id: number; x: number; y: number; at: number } | null = null;
  private done = false;

  constructor(
    readonly ms = 480,
    readonly slop = 10,
  ) {}

  down(id: number, x: number, y: number, now: number): void {
    // a second finger means a pinch or the other thumb, never a press on one body
    if (this.finger) {
      this.finger = null;
      this.done = true;
      return;
    }
    this.finger = { id, x, y, at: now };
    this.done = false;
  }

  move(id: number, x: number, y: number): void {
    const f = this.finger;
    if (f && f.id === id && Math.hypot(x - f.x, y - f.y) > this.slop) this.finger = null;
  }

  up(id: number): void {
    if (this.finger?.id === id) this.finger = null;
    if (!this.finger) this.done = false;
  }

  /** Where the press is, the first time this is asked at or after `ms`; null otherwise. */
  fire(now: number): { x: number; y: number } | null {
    const f = this.finger;
    if (!f || this.done || now - f.at < this.ms) return null;
    this.done = true;
    return { x: f.x, y: f.y };
  }
}
