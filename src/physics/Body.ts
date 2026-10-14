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
    const mass = options.mass ?? 1;
    if (this.type === 'dynamic' && !(mass > 0)) throw new Error(`Body: a dynamic body needs a positive mass, got ${mass}`);
    this.mass = this.type === 'dynamic' ? mass : Infinity;
    this.invMass = this.type === 'dynamic' ? 1 / mass : 0;
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
    return s.kind === 'circle' ? s.radius : Math.min(s.halfWidth, s.halfHeight);
  }

  updateBounds(): void {
    const s = this.shape;
    const hw = s.kind === 'circle' ? s.radius : s.halfWidth;
    const hh = s.kind === 'circle' ? s.radius : s.halfHeight;
    this.minX = this.x - hw;
    this.maxX = this.x + hw;
    this.minY = this.y - hh;
    this.maxY = this.y + hh;
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

  /** An instant change of momentum (a jump, a hit): velocity changes by `impulse / mass`. */
  applyImpulse(ix: number, iy: number): void {
    if (this.type !== 'dynamic') return;
    this.vx += ix * this.invMass;
    this.vy += iy * this.invMass;
    this.wake();
  }

  /** A force held for the next step (thrust, wind); it is cleared once the step has used it. */
  applyForce(fx: number, fy: number): void {
    if (this.type !== 'dynamic') return;
    this.fx += fx;
    this.fy += fy;
    this.wake();
  }

  /**
   * Puts the body somewhere without sweeping it there; the drawn position jumps too (no interpolation across it).
   * A static body moved this way must be followed by `PhysicsWorld.staticsChanged()`.
   */
  setPosition(x: number, y: number): void {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.updateBounds();
    this.wake();
  }
}
