import type { Body } from './Body';
import type { Contact, ContactPoint } from './Contact';

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

const cross = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;

/** Angular inverse mass as the solver sees it: a sleeping body holds still like ground. */
const solverInvInertia = (b: Body): number => (b.awake ? b.invInertia : 0);

/**
 * Sequential impulses: each contact point is a normal constraint (no approach, plus bounce) and a friction constraint
 * clamped by its normal impulse (Coulomb), applied at the point so a body that rotates is turned by it. Penetration
 * is not fed back into the velocities (no Baumgarte energy): it is removed afterwards by moving positions and angles
 * only, tracked as the bodies move (a "split impulse" in its simplest form), so resting bodies do not bounce off their
 * own correction. Bodies that do not rotate have no inverse inertia, and every angular term drops out.
 */
export class ContactSolver {
  constructor(private readonly settings: SolverSettings) {}

  /** Mass, friction and the velocity target of every enabled contact point; then the impulses carried over from the last sub-step are applied (warm start). */
  prepare(contacts: readonly Contact[], dt: number): void {
    const { restitutionThreshold } = this.settings;
    for (const c of contacts) {
      if (!c.enabled) continue;
      const a = c.a;
      const b = c.b;
      const ia = a.solverInvMass;
      const ib = b.solverInvMass;
      const iia = solverInvInertia(a);
      const iib = solverInvInertia(b);
      c.mu = Math.sqrt(a.friction * b.friction);
      const nx = c.nx;
      const ny = c.ny;
      const tx = -ny;
      const ty = nx;
      const e = Math.max(a.restitution, b.restitution);
      for (let i = 0; i < c.count; i++) {
        const p = c.pts[i]!;
        p.rax = p.x - a.x;
        p.ray = p.y - a.y;
        p.rbx = p.x - b.x;
        p.rby = p.y - b.y;
        const rnA = cross(p.rax, p.ray, nx, ny);
        const rnB = cross(p.rbx, p.rby, nx, ny);
        const kn = ia + ib + iia * rnA * rnA + iib * rnB * rnB;
        p.massN = kn > 0 ? 1 / kn : 0;
        const rtA = cross(p.rax, p.ray, tx, ty);
        const rtB = cross(p.rbx, p.rby, tx, ty);
        const kt = ia + ib + iia * rtA * rtA + iib * rtB * rtB;
        p.massT = kt > 0 ? 1 / kt : 0;
        const vn = relX(a, b, p) * nx + relY(a, b, p) * ny;
        if (p.depth < 0) {
          // still a hair apart: let them close the gap this sub-step, no more (a speculative contact)
          p.target = p.depth / dt;
        } else {
          p.target = vn < -restitutionThreshold ? -e * vn : 0;
        }
        apply(a, b, p, p.jn * nx + p.jt * tx, p.jn * ny + p.jt * ty, ia, ib, iia, iib);
      }
    }
  }

  solveVelocities(contacts: readonly Contact[]): void {
    for (const c of contacts) {
      if (!c.enabled) continue;
      const a = c.a;
      const b = c.b;
      const ia = a.solverInvMass;
      const ib = b.solverInvMass;
      const iia = solverInvInertia(a);
      const iib = solverInvInertia(b);
      const nx = c.nx;
      const ny = c.ny;
      const tx = -ny;
      const ty = nx;
      for (let i = 0; i < c.count; i++) {
        const p = c.pts[i]!;
        if (p.massN === 0) continue;
        // friction first, bounded by the normal impulse of the last iteration
        const vt = relX(a, b, p) * tx + relY(a, b, p) * ty;
        const maxT = c.mu * p.jn;
        const jtNew = Math.max(-maxT, Math.min(maxT, p.jt - vt * p.massT));
        const dT = jtNew - p.jt;
        p.jt = jtNew;
        apply(a, b, p, dT * tx, dT * ty, ia, ib, iia, iib);

        const vn = relX(a, b, p) * nx + relY(a, b, p) * ny;
        const jnNew = Math.max(0, p.jn + (p.target - vn) * p.massN);
        const dn = jnNew - p.jn;
        p.jn = jnNew;
        apply(a, b, p, dn * nx, dn * ny, ia, ib, iia, iib);
      }
    }
  }

  /** Pushes overlapping pairs apart along their normals, by position (and angle) only. */
  solvePositions(contacts: readonly Contact[]): void {
    const { slop, correction, maxCorrection } = this.settings;
    for (const c of contacts) {
      if (!c.enabled) continue;
      const a = c.a;
      const b = c.b;
      const ia = a.solverInvMass;
      const ib = b.solverInvMass;
      const iia = solverInvInertia(a);
      const iib = solverInvInertia(b);
      const nx = c.nx;
      const ny = c.ny;
      for (let i = 0; i < c.count; i++) {
        const p = c.pts[i]!;
        // where the point's two anchors are now: their drift apart along the normal is what the depth has lost
        const ca = a.rotates ? Math.cos(a.angle) : a.cos;
        const sa = a.rotates ? Math.sin(a.angle) : a.sin;
        const cb = b.rotates ? Math.cos(b.angle) : b.cos;
        const sb = b.rotates ? Math.sin(b.angle) : b.sin;
        const rax = ca * p.lax - sa * p.lay;
        const ray = sa * p.lax + ca * p.lay;
        const rbx = cb * p.lbx - sb * p.lby;
        const rby = sb * p.lbx + cb * p.lby;
        const moved = (b.x + rbx - (a.x + rax)) * nx + (b.y + rby - (a.y + ray)) * ny;
        const depth = p.depth - moved;
        if (depth <= slop) continue;
        const rnA = cross(rax, ray, nx, ny);
        const rnB = cross(rbx, rby, nx, ny);
        const k = ia + ib + iia * rnA * rnA + iib * rnB * rnB;
        if (k === 0) continue;
        const push = Math.min(maxCorrection, correction * (depth - slop)) / k;
        const px = push * nx;
        const py = push * ny;
        a.x -= px * ia;
        a.y -= py * ia;
        b.x += px * ib;
        b.y += py * ib;
        if (iia > 0) a.angle -= iia * cross(rax, ray, px, py);
        if (iib > 0) b.angle += iib * cross(rbx, rby, px, py);
      }
    }
  }
}

/** Velocity of b's material at the point less a's. */
function relX(a: Body, b: Body, p: ContactPoint): number {
  return b.vx - b.angularVelocity * p.rby - (a.vx - a.angularVelocity * p.ray);
}

function relY(a: Body, b: Body, p: ContactPoint): number {
  return b.vy + b.angularVelocity * p.rbx - (a.vy + a.angularVelocity * p.rax);
}

/** Impulse (px, py) on b at the point, its opposite on a. */
function apply(a: Body, b: Body, p: ContactPoint, px: number, py: number, ia: number, ib: number, iia: number, iib: number): void {
  a.vx -= px * ia;
  a.vy -= py * ia;
  b.vx += px * ib;
  b.vy += py * ib;
  if (iia > 0) a.angularVelocity -= iia * cross(p.rax, p.ray, px, py);
  if (iib > 0) b.angularVelocity += iib * cross(p.rbx, p.rby, px, py);
}
