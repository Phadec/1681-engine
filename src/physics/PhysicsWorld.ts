import { EventBus } from '../events/EventBus';
import { Body } from './Body';
import { BroadPhase } from './BroadPhase';
import { collide, emptyManifold, type Manifold } from './collide';
import { Contact } from './Contact';
import { ContactSolver, type SolverSettings } from './ContactSolver';
import { info, setGround } from './contactReport';
import type { PhysicsWorldOptions } from './PhysicsWorldOptions';
import { castRay } from './raycast';
import type { BodyOptions, ContactInfo, PhysicsEvents, RayHit, RaycastOptions } from './types';

/**
 * A rigid-body world for platformers and physics toys: dynamic, static and kinematic circles, boxes and convex
 * polygons, turned by contacts when made with `rotates: true`, stepped at a fixed dt (`physicsSystem` runs it as a
 * `fixed` system). Each step: forces and gravity (semi-implicit Euler), broad phase, narrow phase, sequential impulses
 * with warm starting, then positions, then overlap removed by moving positions. Fast bodies are handled by
 * sub-stepping, not swept tests.
 *
 * Not deterministic across machines: the solver's results depend on body order and floating point, which is fine for
 * a single player's world but not for one a server must replay (use `net/movement` for that).
 */
export class PhysicsWorld {
  gravityX: number;
  gravityY: number;
  readonly events = new EventBus<PhysicsEvents>();
  /** Called for each touching solid pair every sub-step; returning false skips its response this sub-step (one-way platforms). */
  preSolve: ((contact: Contact) => boolean) | null = null;
  private readonly list: Body[] = [];
  private readonly broad: BroadPhase;
  private readonly solver: ContactSolver;
  private readonly contacts = new Map<number, Contact>();
  private readonly active: Contact[] = [];
  private readonly manifold = emptyManifold();
  private readonly removals: Body[] = [];
  private readonly settings: SolverSettings;
  private readonly velocityIterations: number;
  private readonly positionIterations: number;
  private readonly maxSubsteps: number;
  private readonly maxSpeed: number;
  private readonly margin: number;
  private readonly groundNormal: number;
  private readonly allowSleep: boolean;
  private readonly sleepSpeed: number;
  private readonly sleepTime: number;
  private stepCount = 0;
  private subCount = 0;
  private stepping = false;

  constructor(options: PhysicsWorldOptions = {}) {
    this.gravityX = options.gravityX ?? 0;
    this.gravityY = options.gravityY ?? 980;
    this.margin = options.contactMargin ?? 0.5;
    this.settings = {
      restitutionThreshold: options.restitutionThreshold ?? 40,
      slop: options.slop ?? 0.05,
      correction: options.correction ?? 0.4,
      maxCorrection: options.maxCorrection ?? 4,
    };
    this.solver = new ContactSolver(this.settings);
    this.broad = new BroadPhase(options.cellSize ?? 64, this.margin);
    this.velocityIterations = options.velocityIterations ?? 8;
    this.positionIterations = options.positionIterations ?? 3;
    this.maxSubsteps = Math.max(1, options.maxSubsteps ?? 16);
    this.maxSpeed = options.maxSpeed ?? 4000;
    this.groundNormal = options.groundNormal ?? 0.7;
    this.allowSleep = options.allowSleep ?? false;
    this.sleepSpeed = options.sleepSpeed ?? 4;
    this.sleepTime = options.sleepTime ?? 0.5;
  }

  /** Adds a body (or makes one from options) and returns it. */
  add(body: Body | BodyOptions): Body {
    const b = body instanceof Body ? body : new Body(body);
    if (b.inWorld) return b;
    b.inWorld = true;
    b.updateBounds();
    b.wake();
    this.list.push(b);
    if (b.isStatic) this.broad.markStaticsDirty();
    return b;
  }

  addAll(bodies: Iterable<Body>): void {
    for (const b of bodies) this.add(b);
  }

  /** Takes a body out; its contacts end (with `end` events). During a step it waits until the step is over. */
  remove(body: Body): void {
    if (!body.inWorld) return;
    if (this.stepping) {
      this.removals.push(body);
      return;
    }
    body.inWorld = false;
    const i = this.list.indexOf(body);
    if (i >= 0) this.list.splice(i, 1);
    if (body.isStatic) this.broad.markStaticsDirty();
    body.grounded = false;
    body.ground = null;
    const ended: ContactInfo[] = [];
    for (const [key, c] of this.contacts) {
      if (c.a !== body && c.b !== body) continue;
      c.other(body).wake();
      if (c.reported) ended.push(info(c));
      this.contacts.delete(key);
    }
    for (const e of ended) this.events.emit('end', e);
  }

  /** Call after moving, resizing or retyping a static body by hand. */
  staticsChanged(): void {
    this.broad.markStaticsDirty();
  }

  get bodyCount(): number {
    return this.list.length;
  }

  /**
   * Every body in the world, in the order added: for tools (a debug drawing, an inspector) that would otherwise keep
   * a second list beside the world's. Read it, never hold it across a step: adding and removing change it in place.
   */
  get bodies(): readonly Body[] {
    return this.list;
  }

  /** Advances the world by `dt` seconds; call it with the fixed step (`FixedLoop.stepSeconds`). */
  step(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.stepping = true;
    try {
      this.stepCount++;
      for (const b of this.list) {
        b.prevX = b.x;
        b.prevY = b.y;
        b.prevAngle = b.angle;
      }
      const n = this.substepsFor(dt);
      for (let i = 0; i < n; i++) this.substep(dt / n);
      for (const b of this.list) {
        b.fx = 0;
        b.fy = 0;
        b.torque = 0;
      }
      if (this.allowSleep) this.updateSleep(dt);
    } finally {
      this.stepping = false;
    }
    this.finishContacts();
    for (const b of this.removals.splice(0)) this.remove(b);
  }

  /** The first body on the segment from (x0, y0) to (x1, y1). Bodies the ray starts inside are skipped. */
  raycast(x0: number, y0: number, x1: number, y1: number, options?: RaycastOptions): RayHit | null {
    for (const b of this.list) if (!b.isStatic) b.updateBounds();
    this.broad.rebuild(this.list);
    return castRay([this.broad.statics, this.broad.movers], x0, y0, x1, y1, options);
  }

  /** The pairs touching `body` after the last step (sensors' overlaps included). */
  contactsOf(body: Body, out: ContactInfo[] = []): ContactInfo[] {
    out.length = 0;
    for (const c of this.contacts.values()) if (c.reported && (c.a === body || c.b === body)) out.push(c);
    return out;
  }

  /** Whether `body` stood on something at the end of the last step (also `body.grounded`). */
  isGrounded(body: Body): boolean {
    return body.grounded;
  }

  private substepsFor(dt: number): number {
    const gx = this.gravityX;
    const gy = this.gravityY;
    let worst = 0;
    for (const b of this.list) {
      if (!b.moving) continue;
      const g = b.isDynamic ? Math.hypot(gx, gy) * Math.abs(b.gravityScale) * dt : 0;
      // a turning body's corners sweep too
      const speed = Math.min(this.maxSpeed, Math.hypot(b.vx, b.vy) + g + Math.abs(b.angularVelocity) * b.maxExtent);
      worst = Math.max(worst, (speed * dt) / Math.max(0.5, b.minHalfExtent));
    }
    return Math.min(this.maxSubsteps, Math.max(1, Math.ceil(worst)));
  }

  private substep(h: number): void {
    this.subCount++;
    const max2 = this.maxSpeed * this.maxSpeed;
    for (const b of this.list) {
      if (!b.isDynamic || !b.awake) continue;
      b.vx += (this.gravityX * b.gravityScale + b.fx * b.invMass) * h;
      b.vy += (this.gravityY * b.gravityScale + b.fy * b.invMass) * h;
      if (b.linearDamping > 0) {
        const k = 1 / (1 + b.linearDamping * h);
        b.vx *= k;
        b.vy *= k;
      }
      const s2 = b.vx * b.vx + b.vy * b.vy;
      if (s2 > max2) {
        const k = this.maxSpeed / Math.sqrt(s2);
        b.vx *= k;
        b.vy *= k;
      }
      if (b.invInertia > 0) {
        b.angularVelocity += b.torque * b.invInertia * h;
        if (b.angularDamping > 0) b.angularVelocity /= 1 + b.angularDamping * h;
        // no corner faster than the speed limit
        const maxW = this.maxSpeed / Math.max(1, b.maxExtent);
        if (Math.abs(b.angularVelocity) > maxW) b.angularVelocity = Math.sign(b.angularVelocity) * maxW;
      }
    }
    this.broad.rebuild(this.list);
    this.active.length = 0;
    this.broad.pairs(this.list, this.visitPair);
    this.solver.prepare(this.active, h);
    for (let i = 0; i < this.velocityIterations; i++) this.solver.solveVelocities(this.active);
    for (const b of this.list) {
      if (!b.moving) continue;
      b.x += b.vx * h;
      b.y += b.vy * h;
      if (b.rotates) b.angle += b.angularVelocity * h;
    }
    for (let i = 0; i < this.positionIterations; i++) this.solver.solvePositions(this.active);
    for (const b of this.list) if (b.moving) b.updateBounds();
  }

  private readonly visitPair = (p: Body, q: Body): void => {
    if (!(p.layer & q.mask) || !(q.layer & p.mask)) return;
    const sensor = p.sensor || q.sensor;
    // two bodies nothing can push: only a sensor among them has anything to report
    if (p.invMass === 0 && q.invMass === 0 && !sensor) return;
    const a = p.id < q.id ? p : q;
    const b = a === p ? q : p;
    const m = this.manifold;
    if (!collide(a, b, sensor ? 0 : this.margin, m)) return;
    if (sensor && m.depth <= 0) return;
    const key = Contact.keyOf(a, b);
    let c = this.contacts.get(key);
    if (!c) {
      c = new Contact(a, b, key);
      this.contacts.set(key, c);
    }
    this.takeManifold(c, m, c.seenSub === this.subCount - 1);
    c.seenSub = this.subCount;
    c.seenStep = this.stepCount;
    if (sensor) {
      c.enabled = false;
      return;
    }
    if (a.awake !== b.awake) this.wakeOnImpact(a, b);
    c.enabled = this.preSolve ? this.preSolve(c) !== false : true;
    if (c.enabled) this.active.push(c);
  };

  /**
   * Copies the narrow phase's points into the contact, carrying each point's impulses over from the last sub-step
   * when the same feature touches again (`warm`: the pair touched on the last sub-step).
   */
  private takeManifold(c: Contact, m: Manifold, warm: boolean): void {
    const a = c.a;
    const b = c.b;
    let j0n = 0;
    let j0t = 0;
    let j1n = 0;
    let j1t = 0;
    let id0 = -1;
    let id1 = -1;
    if (warm) {
      if (c.count > 0) {
        id0 = c.pts[0].id;
        j0n = c.pts[0].jn;
        j0t = c.pts[0].jt;
      }
      if (c.count > 1) {
        id1 = c.pts[1].id;
        j1n = c.pts[1].jn;
        j1t = c.pts[1].jt;
      }
    }
    c.nx = m.nx;
    c.ny = m.ny;
    c.depth = m.depth;
    c.count = m.count;
    for (let i = 0; i < m.count; i++) {
      const p = c.pts[i]!;
      const id = m.id[i]!;
      p.x = m.px[i]!;
      p.y = m.py[i]!;
      p.depth = m.pd[i]!;
      p.id = id;
      p.jn = id === id0 ? j0n : id === id1 ? j1n : 0;
      p.jt = id === id0 ? j0t : id === id1 ? j1t : 0;
      const dax = p.x - a.x;
      const day = p.y - a.y;
      p.lax = a.cos * dax + a.sin * day;
      p.lay = -a.sin * dax + a.cos * day;
      const dbx = p.x - b.x;
      const dby = p.y - b.y;
      p.lbx = b.cos * dbx + b.sin * dby;
      p.lby = -b.sin * dbx + b.cos * dby;
    }
  }

  /** A sleeping body wakes when something meets it faster than the sleep speed (a kinematic platform always does). */
  private wakeOnImpact(a: Body, b: Body): void {
    const sleeper = a.awake ? b : a;
    const mover = a.awake ? a : b;
    if (sleeper.isStatic) return;
    const rv = Math.hypot(mover.vx - sleeper.vx, mover.vy - sleeper.vy);
    if (mover.type === 'kinematic' || rv > this.sleepSpeed) sleeper.wake();
  }

  private updateSleep(dt: number): void {
    const s2 = this.sleepSpeed * this.sleepSpeed;
    for (const b of this.list) {
      if (!b.isDynamic || !b.awake) continue;
      const spin = b.angularVelocity * b.maxExtent;
      if (b.vx * b.vx + b.vy * b.vy + spin * spin > s2 || b.fx !== 0 || b.fy !== 0 || b.torque !== 0) {
        b.restTime = 0;
        continue;
      }
      b.restTime += dt;
      if (b.restTime >= this.sleepTime) {
        b.awake = false;
        b.vx = 0;
        b.vy = 0;
        b.angularVelocity = 0;
      }
    }
  }

  /** Ends pairs no longer touching, starts new ones, refreshes `grounded`, then emits the events. */
  private finishContacts(): void {
    for (const b of this.list) {
      b.grounded = false;
      b.ground = null;
    }
    const begun: ContactInfo[] = [];
    const ended: ContactInfo[] = [];
    const cos = this.groundNormal;
    for (const [key, c] of this.contacts) {
      // a pair of bodies that are both at rest is not re-tested: it keeps touching as it was
      const touching = c.seenStep === this.stepCount || (c.reported && !c.a.moving && !c.b.moving);
      if (!touching) {
        if (c.reported) ended.push(info(c));
        this.contacts.delete(key);
        continue;
      }
      if (!c.reported) {
        c.reported = true;
        begun.push(info(c));
      }
      if (c.sensor || !c.enabled) continue;
      if (c.ny < -cos) setGround(c.b, c.a, c);
      else if (c.ny > cos) setGround(c.a, c.b, c);
    }
    for (const e of ended) this.events.emit('end', e);
    for (const e of begun) this.events.emit('begin', e);
  }
}
