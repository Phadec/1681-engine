import type { Contact } from './Contact';

/** Tuning the solver reads; `PhysicsWorld` owns the values. */
export interface SolverSettings {
  /** Approach speed (px/s) below which nothing bounces, so a resting body does not hop on gravity's own step. */
  restitutionThreshold: number;
  /** Overlap (px) left alone by position correction: a little keeps resting contacts alive and steady. */
  slop: number;
  /** Share of the remaining overlap removed per position iteration. */
  correction: number;
  /** The most one position iteration moves a pair apart (px), so a deep overlap is undone over a few steps, not flung. */
  maxCorrection: number;
}

/**
 * Sequential impulses over contacts with no rotation: each contact is a normal constraint (no approach, plus
 * bounce) and a friction constraint clamped by the normal impulse (Coulomb). Penetration is not fed back into the
 * velocities (no Baumgarte energy): it is removed afterwards by moving positions only, tracked as the bodies move
 * (a "split impulse" in its simplest form), so resting bodies do not bounce off their own correction.
 */
export class ContactSolver {
  constructor(private readonly settings: SolverSettings) {}

  /** Mass, friction and the velocity target of every enabled contact; then the impulses carried over from the last sub-step are applied (warm start). */
  prepare(contacts: readonly Contact[], dt: number): void {
    const { restitutionThreshold } = this.settings;
    for (const c of contacts) {
      if (!c.enabled) continue;
      const a = c.a;
      const b = c.b;
      const ia = a.solverInvMass;
      const ib = b.solverInvMass;
      const k = ia + ib;
      c.massN = k > 0 ? 1 / k : 0;
      c.mu = Math.sqrt(a.friction * b.friction);
      const vn = (b.vx - a.vx) * c.nx + (b.vy - a.vy) * c.ny;
      if (c.depth < 0) {
        // still a hair apart: let them close the gap this sub-step, no more (a speculative contact)
        c.target = c.depth / dt;
      } else {
        const e = Math.max(a.restitution, b.restitution);
        c.target = vn < -restitutionThreshold ? -e * vn : 0;
      }
      const tx = -c.ny;
      const ty = c.nx;
      const px = c.jn * c.nx + c.jt * tx;
      const py = c.jn * c.ny + c.jt * ty;
      a.vx -= px * ia;
      a.vy -= py * ia;
      b.vx += px * ib;
      b.vy += py * ib;
    }
  }

  solveVelocities(contacts: readonly Contact[]): void {
    for (const c of contacts) {
      if (!c.enabled || c.massN === 0) continue;
      const a = c.a;
      const b = c.b;
      const ia = a.solverInvMass;
      const ib = b.solverInvMass;
      const tx = -c.ny;
      const ty = c.nx;

      // friction first, bounded by the normal impulse of the last iteration
      const vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
      const maxT = c.mu * c.jn;
      const jtNew = Math.max(-maxT, Math.min(maxT, c.jt - vt * c.massN));
      const dT = jtNew - c.jt;
      c.jt = jtNew;
      a.vx -= dT * tx * ia;
      a.vy -= dT * ty * ia;
      b.vx += dT * tx * ib;
      b.vy += dT * ty * ib;

      const vn = (b.vx - a.vx) * c.nx + (b.vy - a.vy) * c.ny;
      const jnNew = Math.max(0, c.jn + (c.target - vn) * c.massN);
      const dn = jnNew - c.jn;
      c.jn = jnNew;
      a.vx -= dn * c.nx * ia;
      a.vy -= dn * c.ny * ia;
      b.vx += dn * c.nx * ib;
      b.vy += dn * c.ny * ib;
    }
  }

  /** Pushes overlapping pairs apart along their normals, by position only. */
  solvePositions(contacts: readonly Contact[]): void {
    const { slop, correction, maxCorrection } = this.settings;
    for (const c of contacts) {
      if (!c.enabled || c.massN === 0) continue;
      const a = c.a;
      const b = c.b;
      const moved = (b.x - c.bx0 - (a.x - c.ax0)) * c.nx + (b.y - c.by0 - (a.y - c.ay0)) * c.ny;
      const depth = c.depth - moved;
      if (depth <= slop) continue;
      const push = Math.min(maxCorrection, correction * (depth - slop)) * c.massN;
      const ia = a.solverInvMass;
      const ib = b.solverInvMass;
      a.x -= push * c.nx * ia;
      a.y -= push * c.ny * ia;
      b.x += push * c.nx * ib;
      b.y += push * c.ny * ib;
    }
  }
}
