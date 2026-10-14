/**
 * The particles of one emitter as flat typed arrays (structure of arrays): position, velocity, age and lifetime,
 * rotation and spin, and a per-particle random draw the curves can use. Pure, no Pixi: the emitter draws what this
 * holds, and tests step it under node.
 *
 * Live particles are packed at indices `0 … count - 1`. A particle that dies is replaced by the last live one, so a
 * step never leaves holes and never allocates; the order of particles is therefore not stable, which drawing does
 * not need (every live index is written again each frame).
 */
export class ParticleSim {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly rot: Float32Array;
  readonly spin: Float32Array;
  /** A random draw per particle (0–1), fixed for its life: size variance, flicker phase. */
  readonly seed: Float32Array;
  count = 0;

  constructor(readonly capacity: number) {
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.seed = new Float32Array(capacity);
  }

  /** Adds a particle; returns its index, or -1 when the sim is full. `life` is in seconds. */
  spawn(x: number, y: number, vx: number, vy: number, life: number, rot: number, spin: number, seed: number): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.age[i] = 0;
    this.life[i] = life > 0 ? life : 1e-3;
    this.rot[i] = rot;
    this.spin[i] = spin;
    this.seed[i] = seed;
    return i;
  }

  /**
   * Advances every particle by `dt` seconds: gravity (px/s²) added to velocity, then drag, then position. Drag is
   * the share of speed lost per second, applied as `exp(-drag × dt)` so it is the same at any frame rate. Returns how
   * many particles died this step.
   */
  step(dt: number, gravityX: number, gravityY: number, drag: number): number {
    const damp = drag > 0 ? Math.exp(-drag * dt) : 1;
    let died = 0;
    let i = 0;
    while (i < this.count) {
      const age = this.age[i]! + dt;
      if (age >= this.life[i]!) {
        this.removeAt(i);
        died++;
        continue; // the particle moved into `i` has not stepped yet
      }
      this.age[i] = age;
      const vx = (this.vx[i]! + gravityX * dt) * damp;
      const vy = (this.vy[i]! + gravityY * dt) * damp;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.x[i] = this.x[i]! + vx * dt;
      this.y[i] = this.y[i]! + vy * dt;
      this.rot[i] = this.rot[i]! + this.spin[i]! * dt;
      i++;
    }
    return died;
  }

  /** The share of its life particle `i` has lived (0–1). */
  progress(i: number): number {
    return this.age[i]! / this.life[i]!;
  }

  /** Every particle gone; returns how many there were. */
  clear(): number {
    const n = this.count;
    this.count = 0;
    return n;
  }

  private removeAt(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last]!;
    this.y[i] = this.y[last]!;
    this.vx[i] = this.vx[last]!;
    this.vy[i] = this.vy[last]!;
    this.age[i] = this.age[last]!;
    this.life[i] = this.life[last]!;
    this.rot[i] = this.rot[last]!;
    this.spin[i] = this.spin[last]!;
    this.seed[i] = this.seed[last]!;
  }
}
