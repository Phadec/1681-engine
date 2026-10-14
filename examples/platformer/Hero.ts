import { Body, Image, syncToBody, type Stage } from '../../src';
import { HERO, HERO_FRAMES } from './art';

/** One step of what the player asks for. */
export interface HeroInput {
  /** −1 … 1. */
  move: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  down: boolean;
}

/** Collision layers, as bits: the hero meets the world, crates and pickups; pickups only notice the hero. */
export const LAYER = { world: 1, hero: 2, crate: 4, pickup: 8 } as const;

const HALF_W = 5;
const HALF_H = 7;
const RUN = 105;
const ACCEL_GROUND = 1200;
const ACCEL_AIR = 700;
const JUMP_SPEED = 375;
/** Letting go of jump while still rising keeps this share of the climb: a tap is a hop, a hold a full jump. */
const JUMP_CUT = 0.45;
const MAX_FALL = 420;
/** Seconds after running off a ledge in which a jump still counts as from the ground. */
const COYOTE = 0.1;
/** Seconds a jump pressed just before landing is remembered and spent on touchdown. */
const BUFFER = 0.12;
/** Seconds one-way planks let the hero fall through after Down + jump. */
const DROP = 0.25;

/**
 * The hero's controller over a physics box. The physics world decides where it can be (walls, crates, platforms);
 * this decides how it wants to move: run speed reached by acceleration, a jump with coyote time and a buffer, and a
 * variable height. Feel lives here, in a few constants, rather than in the solver.
 */
export class Hero {
  readonly body: Body;
  readonly view: Image;
  /** The way it faces, for the sprite and the dust. */
  facing = 1;
  private coyote = 0;
  private buffer = 0;
  private rising = false;
  private dropLeft = 0;
  /** Fastest fall since it last stood on something: how hard a landing is. */
  private fallSpeed = 0;
  private wasGrounded = false;
  private runClock = 0;

  constructor(
    stage: Stage,
    private readonly startX: number,
    private readonly startY: number,
  ) {
    this.body = new Body({
      shape: { kind: 'box', halfWidth: HALF_W, halfHeight: HALF_H },
      x: startX,
      y: startY,
      // no friction: the controller sets the run speed itself, and a frictionless box never sticks to a wall it
      // presses against in the air
      friction: 0,
      layer: LAYER.hero,
      mask: LAYER.world | LAYER.crate | LAYER.pickup,
      userData: 'hero',
    });
    // anchored at its feet, which sit on the box's bottom edge
    this.view = new Image(stage.textures, 0, 0, HERO.key, HERO_FRAMES.idle).setOrigin(0.5, 1);
  }

  /** One-way planks ignore the hero for a moment after Down + jump. */
  get dropping(): boolean {
    return this.dropLeft > 0;
  }

  get grounded(): boolean {
    return this.body.grounded;
  }

  /** Before the physics step: turns input into velocity. Returns true on the step it jumps. */
  control(input: HeroInput, dt: number): boolean {
    const b = this.body;
    if (input.move !== 0) this.facing = Math.sign(input.move);
    this.coyote = b.grounded ? COYOTE : Math.max(0, this.coyote - dt);
    this.buffer = input.jumpPressed ? BUFFER : Math.max(0, this.buffer - dt);
    this.dropLeft = Math.max(0, this.dropLeft - dt);

    // stand on a moving platform and you move with it: the run speed is measured against what is under the feet
    const carry = b.grounded && b.ground?.type === 'kinematic' ? b.ground.vx : 0;
    const target = input.move * RUN + carry;
    const accel = b.grounded ? ACCEL_GROUND : ACCEL_AIR;
    const dv = target - b.vx;
    b.vx += Math.max(-accel * dt, Math.min(accel * dt, dv));

    let jumped = false;
    if (this.buffer > 0 && this.coyote > 0) {
      const onPlank = b.ground?.userData === 'one-way';
      if (input.down && onPlank) this.dropLeft = DROP;
      else {
        b.vy = -JUMP_SPEED;
        this.rising = true;
        jumped = true;
      }
      this.buffer = 0;
      this.coyote = 0;
    }
    if (this.rising && !input.jumpHeld && b.vy < 0) {
      b.vy *= JUMP_CUT;
      this.rising = false;
    }
    if (b.vy >= 0) this.rising = false;
    if (b.vy > MAX_FALL) b.vy = MAX_FALL;
    b.wake();
    return jumped;
  }

  /** After the physics step: the fall speed it landed with (0 if it did not land this step). */
  settle(): number {
    const b = this.body;
    let landed = 0;
    if (!b.grounded) this.fallSpeed = Math.max(this.fallSpeed, b.vy);
    else if (!this.wasGrounded) landed = Math.max(this.fallSpeed, 1);
    if (b.grounded) this.fallSpeed = 0;
    this.wasGrounded = b.grounded;
    return landed;
  }

  /** Back to the start, still. */
  respawn(): void {
    this.body.setPosition(this.startX, this.startY);
    this.body.setVelocity(0, 0);
    this.fallSpeed = 0;
    this.rising = false;
  }

  /** Places and poses the sprite for this frame (`alpha`: the share of a step since the last one). */
  draw(alpha: number, dt: number): void {
    const b = this.body;
    syncToBody(this.view, b, alpha, 0, HALF_H, true);
    this.view.flipX = this.facing < 0;
    let frame: number = HERO_FRAMES.idle;
    if (!b.grounded) frame = b.vy < 0 ? HERO_FRAMES.jump : HERO_FRAMES.fall;
    else if (Math.abs(b.vx - (b.ground?.vx ?? 0)) > 20) {
      this.runClock += dt * 12;
      const run = HERO_FRAMES.run;
      frame = run[Math.floor(this.runClock) % run.length]!;
    }
    if (String(frame) !== this.view.frameName) this.view.setFrame(frame);
  }

  /** Where its feet are, for dust. */
  get feetX(): number {
    return this.body.x;
  }

  get feetY(): number {
    return this.body.y + HALF_H;
  }
}
