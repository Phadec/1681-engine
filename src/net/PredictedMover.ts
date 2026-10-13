import type { InputStep, MovementParams } from './constants';
import { createMover, stepMover, type CollisionGrid, type MoverState } from './movement';
import { moverFromWire, type MoverWire } from './protocol';

/**
 * Client-side prediction for the local player's body. Every input step is applied at once (the player sees their
 * own move with no lag) and kept until the server acknowledges it. When a snapshot says where the server has the
 * body as of step `ack`, the body is put there and every step after `ack` is replayed on top.
 *
 * Movement is deterministic (`stepMover`), so with the same steps, params and grid the replay lands exactly where
 * the prediction was and nothing moves. When it does not (the server refused a step, a collision only it knew of),
 * the difference is `correction`: draw the body at `drawX/drawY`, which ease that jump out over a few frames instead
 * of snapping.
 */
export class PredictedMover {
  readonly mover: MoverState;
  private pending: { seq: number; step: InputStep }[] = [];
  private nextSeq = 0;
  /** The jump the last reconciliation made, still being eased out (world px). */
  private offsetX = 0;
  private offsetY = 0;
  /** How big the last correction was (0 when the prediction was right). */
  correction = 0;
  /** Share of a visual correction left after each 60th of a second (default 0.8). */
  smoothing = 0.8;

  constructor(
    x: number,
    y: number,
    private params: MovementParams,
    private grid: CollisionGrid,
  ) {
    this.mover = createMover(x, y);
  }

  /** Applies one input step now and keeps it for replay; returns its sequence number (send it with the step). */
  step(step: InputStep): number {
    const seq = this.nextSeq++;
    this.pending.push({ seq, step: [step[0], step[1], step[2]] });
    stepMover(this.mover, step, this.params, this.grid);
    return seq;
  }

  /** Steps sent but not yet acknowledged. */
  get unacknowledged(): number {
    return this.pending.length;
  }

  /** The server's word: the body as of step `ack`. Rewinds there and replays the rest. */
  reconcile(ack: number, server: MoverWire): void {
    const beforeX = this.mover.x;
    const beforeY = this.mover.y;
    let drop = 0;
    while (drop < this.pending.length && this.pending[drop]!.seq <= ack) drop++;
    if (drop) this.pending = this.pending.slice(drop);
    moverFromWire(server, this.mover);
    for (const p of this.pending) stepMover(this.mover, p.step, this.params, this.grid);
    const dx = beforeX - this.mover.x;
    const dy = beforeY - this.mover.y;
    this.correction = Math.hypot(dx, dy);
    // a correction this small is float noise; one this large is a teleport, shown at once
    if (this.correction > 0.01 && this.correction < 64) {
      this.offsetX += dx;
      this.offsetY += dy;
    } else if (this.correction >= 64) {
      this.offsetX = this.offsetY = 0;
    }
  }

  /** Eases the visual correction out; call once a frame with its length in seconds. */
  smooth(dt: number): void {
    const k = Math.pow(this.smoothing, dt * 60);
    this.offsetX *= k;
    this.offsetY *= k;
    if (Math.abs(this.offsetX) < 0.01) this.offsetX = 0;
    if (Math.abs(this.offsetY) < 0.01) this.offsetY = 0;
  }

  /** Where to draw the body: the predicted place plus the correction still being eased out. */
  get drawX(): number {
    return this.mover.x + this.offsetX;
  }

  get drawY(): number {
    return this.mover.y + this.offsetY;
  }

  /** New movement rules (a buff, a slow): applied to future steps and to replays. */
  setParams(params: MovementParams): void {
    this.params = params;
  }

  setGrid(grid: CollisionGrid): void {
    this.grid = grid;
  }
}
