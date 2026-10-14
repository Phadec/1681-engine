import { MAX_POLYGON_VERTICES, polygonData } from './polygon';
import type { BodyOptions, BodyType, Shape } from './types';

let nextBodyId = 1;

/**
 * A rigid body: plain data and a few helpers, no drawing. Positions are the shape's centre in world pixels, y down;
 * velocities are px per second. Create bodies with `PhysicsWorld.add`, which also wakes them and puts them in the
 * broad phase.
 */
export class Body {
  readonly id = nextBodyId++;
  readonly type: BodyType;
  shape: Shape;
  x: number;
  y: number;
  /** Position at the start of the last world step: draw at `prev + (current - prev) × alpha`. */
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  /** Radians, clockwise on screen. */
  angle: number;
  /** Angle at the start of the last world step, for drawing between steps like `prevX`. */
  prevAngle: number;
  /** Radians per second. */
  angularVelocity: number;
  /** Contacts and torques turn it (`BodyOptions.rotates`). */
  readonly rotates: boolean;
  /** Turning lost per second, as a share. */
  angularDamping: number;
  /** Torque gathered for the next step, cleared after it. */
  torque = 0;
  /** Moment of inertia about the centre (mass × px²); infinite for a body that does not rotate. */
  readonly inertia: number;
  readonly invInertia: number;
  /** Force gathered for the next step (px·mass/s²), cleared after it. */
  fx = 0;
  fy = 0;
  readonly mass: number;
  readonly invMass: number;
  restitution: number;
  friction: number;
  linearDamping: number;
  gravityScale: number;
  readonly sensor: boolean;
  layer: number;
  mask: number;
  userData: unknown;
  /** Box faces lying against more solid ground (`FACE_*` bits): never a contact normal, so seams do not snag. */
  internalFaces = 0;

  /** A sleeping body is not integrated and is treated as immovable until something wakes it. */
  awake = true;
  /** Seconds spent below the world's sleep speed. */
  restTime = 0;
  /** Standing on something: a solid contact whose normal points up at this body (refreshed every step). */
  grounded = false;
  /** What it stands on, while grounded. */
  ground: Body | null = null;
  groundNx = 0;
  groundNy = 0;

  // bounds, refreshed by `updateBounds`
  minX = 0;
  minY = 0;
  maxX = 0;
  maxY = 0;

  /** @internal cosine and sine of `angle`, refreshed by `updateBounds`. */
  cos = 1;
  sin = 0;
  /** @internal corners and outward face normals in world space (boxes and polygons), refreshed by `updateBounds`. */
  readonly wx = new Float64Array(MAX_POLYGON_VERTICES);
  readonly wy = new Float64Array(MAX_POLYGON_VERTICES);
  readonly wnx = new Float64Array(MAX_POLYGON_VERTICES);
  readonly wny = new Float64Array(MAX_POLYGON_VERTICES);
  /** @internal how many of the above are in use (0 for a circle). */
  corners = 0;

  /** @internal set by the world that holds it. */
  inWorld = false;
  /** @internal last ray that tested this body, so a ray crossing many cells tests it once. */
  rayStamp = 0;

  constructor(options: BodyOptions) {
    this.type = options.type ?? 'dynamic';
    this.shape = options.shape;
    this.x = this.prevX = options.x ?? 0;
    this.y = this.prevY = options.y ?? 0;
    this.vx = options.vx ?? 0;
    this.vy = options.vy ?? 0;
    this.angle = this.prevAngle = options.angle ?? 0;
    this.angularVelocity = options.angularVelocity ?? 0;
    this.angularDamping = options.angularDamping ?? 0.05;
    const mass = options.mass ?? 1;
    if (this.type === 'dynamic' && !(mass > 0)) throw new Error(`Body: a dynamic body needs a positive mass, got ${mass}`);
    this.mass = this.type === 'dynamic' ? mass : Infinity;
    this.invMass = this.type === 'dynamic' ? 1 / mass : 0;
    this.rotates = options.rotates === true && this.type !== 'static';
    const turns = this.rotates && this.type === 'dynamic';
    this.inertia = turns ? mass * inertiaPerMass(this.shape) : Infinity;
    this.invInertia = turns ? 1 / this.inertia : 0;
    this.restitution = options.restitution ?? 0;
    this.friction = options.friction ?? 0.5;
    this.linearDamping = options.linearDamping ?? 0;
    this.gravityScale = options.gravityScale ?? 1;
    this.sensor = options.sensor ?? false;
    this.layer = options.layer ?? 1;
    this.mask = options.mask ?? 0xffffffff;
    this.userData = options.userData;
    this.updateBounds();
  }

  get isDynamic(): boolean {
    return this.type === 'dynamic';
  }

  get isStatic(): boolean {
    return this.type === 'static';
  }

  /** Moves by itself this step: an awake dynamic body or any kinematic one. */
  get moving(): boolean {
    return this.type === 'kinematic' || (this.type === 'dynamic' && this.awake);
  }

  /** Inverse mass as the solver sees it: a sleeping body holds still like ground. */
  get solverInvMass(): number {
    return this.awake ? this.invMass : 0;
  }

  /** The smallest half size of the shape: how far it may move in one sub-step without passing through anything. */
  get minHalfExtent(): number {
    const s = this.shape;
    if (s.kind === 'circle') return s.radius;
    if (s.kind === 'box') return Math.min(s.halfWidth, s.halfHeight);
    return polygonData(s).inradius;
  }

  /** The furthest the shape reaches from the centre: how far a corner sweeps as the body turns. */
  get maxExtent(): number {
    const s = this.shape;
    if (s.kind === 'circle') return s.radius;
    if (s.kind === 'box') return Math.hypot(s.halfWidth, s.halfHeight);
    return polygonData(s).radius;
  }

  /** A box at no angle: the cheap axis-aligned tests apply to it. */
  get axisAligned(): boolean {
    return this.shape.kind === 'box' && this.angle === 0;
  }

  updateBounds(): void {
    const s = this.shape;
    if (s.kind === 'circle') {
      this.cos = Math.cos(this.angle);
      this.sin = Math.sin(this.angle);
      this.corners = 0;
      this.minX = this.x - s.radius;
      this.maxX = this.x + s.radius;
      this.minY = this.y - s.radius;
      this.maxY = this.y + s.radius;
      return;
    }
    if (s.kind === 'box' && this.angle === 0) {
      this.cos = 1;
      this.sin = 0;
      this.setBoxCorners(s.halfWidth, s.halfHeight);
      this.minX = this.x - s.halfWidth;
      this.maxX = this.x + s.halfWidth;
      this.minY = this.y - s.halfHeight;
      this.maxY = this.y + s.halfHeight;
      return;
    }
    const c = (this.cos = Math.cos(this.angle));
    const n = (this.sin = Math.sin(this.angle));
    if (s.kind === 'box') this.setBoxCorners(s.halfWidth, s.halfHeight);
    else {
      const d = polygonData(s);
      this.corners = d.vertices.length;
      for (let i = 0; i < d.vertices.length; i++) {
        this.wx[i] = d.vertices[i]!.x;
        this.wy[i] = d.vertices[i]!.y;
        this.wnx[i] = d.normals[i]!.x;
        this.wny[i] = d.normals[i]!.y;
      }
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < this.corners; i++) {
      const lx = this.wx[i]!;
      const ly = this.wy[i]!;
      const x = this.x + c * lx - n * ly;
      const y = this.y + n * lx + c * ly;
      this.wx[i] = x;
      this.wy[i] = y;
      const nx = this.wnx[i]!;
      const ny = this.wny[i]!;
      this.wnx[i] = c * nx - n * ny;
      this.wny[i] = n * nx + c * ny;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    this.minX = minX;
    this.maxX = maxX;
    this.minY = minY;
    this.maxY = maxY;
  }

  /** Box corners in local space (top, right, bottom, left faces), or in world space when the box sits at no angle. */
  private setBoxCorners(hw: number, hh: number): void {
    const ox = this.angle === 0 ? this.x : 0;
    const oy = this.angle === 0 ? this.y : 0;
    this.corners = 4;
    this.wx[0] = ox - hw;
    this.wy[0] = oy - hh;
    this.wx[1] = ox + hw;
    this.wy[1] = oy - hh;
    this.wx[2] = ox + hw;
    this.wy[2] = oy + hh;
    this.wx[3] = ox - hw;
    this.wy[3] = oy + hh;
    this.wnx[0] = 0;
    this.wny[0] = -1;
    this.wnx[1] = 1;
    this.wny[1] = 0;
    this.wnx[2] = 0;
    this.wny[2] = 1;
    this.wnx[3] = -1;
    this.wny[3] = 0;
  }

  wake(): void {
    if (this.type === 'static') return;
    this.awake = true;
    this.restTime = 0;
  }

  setVelocity(vx: number, vy: number): void {
    this.vx = vx;
    this.vy = vy;
    this.wake();
  }

  /**
   * An instant change of momentum (a jump, a hit): velocity changes by `impulse / mass`. Given a world point
   * (`px`, `py`) off the centre, a body that rotates is also set turning.
   */
  applyImpulse(ix: number, iy: number, px?: number, py?: number): void {
    if (this.type !== 'dynamic') return;
    this.vx += ix * this.invMass;
    this.vy += iy * this.invMass;
    if (px !== undefined && py !== undefined) this.angularVelocity += ((px - this.x) * iy - (py - this.y) * ix) * this.invInertia;
    this.wake();
  }

  /** A force held for the next step (thrust, wind); it is cleared once the step has used it. At a world point, it also turns the body. */
  applyForce(fx: number, fy: number, px?: number, py?: number): void {
    if (this.type !== 'dynamic') return;
    this.fx += fx;
    this.fy += fy;
    if (px !== undefined && py !== undefined) this.torque += (px - this.x) * fy - (py - this.y) * fx;
    this.wake();
  }

  /** A turning force held for the next step (mass × px² / s², clockwise on screen when positive). */
  applyTorque(torque: number): void {
    if (this.type !== 'dynamic' || !this.rotates) return;
    this.torque += torque;
    this.wake();
  }

  /** An instant change of spin: angular velocity changes by `impulse / inertia`. */
  applyAngularImpulse(impulse: number): void {
    if (this.type !== 'dynamic') return;
    this.angularVelocity += impulse * this.invInertia;
    this.wake();
  }

  /** Sets the spin (a kinematic body turns at it; a dynamic one that rotates starts at it). */
  setAngularVelocity(w: number): void {
    this.angularVelocity = w;
    this.wake();
  }

  /** Velocity of the body's material at a world point: its own plus what its spin adds there. */
  velocityAt(px: number, py: number): { x: number; y: number } {
    const w = this.angularVelocity;
    return { x: this.vx - w * (py - this.y), y: this.vy + w * (px - this.x) };
  }

  /**
   * Puts the body somewhere without sweeping it there; the drawn position jumps too (no interpolation across it).
   * A static body moved this way must be followed by `PhysicsWorld.staticsChanged()`.
   */
  setPosition(x: number, y: number, angle = this.angle): void {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.angle = this.prevAngle = angle;
    this.updateBounds();
    this.wake();
  }

  /** Turns the body to `angle` without sweeping it there (like `setPosition`). */
  setAngle(angle: number): void {
    this.setPosition(this.x, this.y, angle);
  }

  /** A world point in the body's own frame (before its turn). */
  toLocal(px: number, py: number): { x: number; y: number } {
    const dx = px - this.x;
    const dy = py - this.y;
    return { x: this.cos * dx + this.sin * dy, y: -this.sin * dx + this.cos * dy };
  }

  /** A point of the body's own frame in the world. */
  toWorld(lx: number, ly: number): { x: number; y: number } {
    return { x: this.x + this.cos * lx - this.sin * ly, y: this.y + this.sin * lx + this.cos * ly };
  }
}

/** Moment of inertia per unit of mass about the centre: a solid disc, a solid box, a solid polygon. */
function inertiaPerMass(s: Shape): number {
  if (s.kind === 'circle') return (s.radius * s.radius) / 2;
  if (s.kind === 'box') return ((2 * s.halfWidth) ** 2 + (2 * s.halfHeight) ** 2) / 12;
  return polygonData(s).inertiaPerMass;
}
