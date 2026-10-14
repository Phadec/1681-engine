import { Particle, ParticleContainer, type IParticle, type Texture } from 'pixi.js';
import { engineSettings } from '../settings';
import { inView, type CameraLike } from '../fx/viewCull';
import { ParticleBudget, particleBudget } from './ParticleBudget';
import { ParticleSim } from './ParticleSim';
import { sampleColor, sampleCurve, type ColorCurve, type Curve } from './particleCurves';
import { dueParticles, sampleRange, scaleCount, spreadAngle, type Range } from './particleSampling';

/** Where a new particle appears round the emitter: a disc, or a box centred on it. */
export type SpawnArea = { readonly radius: number } | { readonly width: number; readonly height: number };

export interface EmitterOptions {
  /** Every particle's texture. One emitter draws one texture (a frame of an atlas works: they share a source). */
  texture: Texture;
  /** Particles this emitter may hold at once (default 256). */
  capacity?: number;
  /** Particles a second while emitting (default 0: bursts only). */
  rate?: number;
  /** Seconds a particle lives (default 1). */
  lifetime?: Range;
  /** Starting speed, px/s (default [40, 80]). */
  speed?: Range;
  /** Direction of travel in radians (default -π/2, up the screen) and how far either way it may turn (default π). */
  angle?: number;
  spread?: number;
  /** Px/s² added to velocity (default none). */
  gravityX?: number;
  gravityY?: number;
  /** Share of speed lost per second (default 0). */
  drag?: number;
  /** Scale of the texture over life (default 1), and how much each particle's size may differ (0–1, default 0). */
  size?: Curve;
  sizeVariance?: number;
  /** Opacity over life (default fading from 1 to 0). */
  alpha?: Curve;
  /** Tint over life, `0xrrggbb` (default white). */
  tint?: ColorCurve;
  /** Starting rotation and spin, radians and radians/s (default 0). */
  rotation?: Range;
  spin?: Range;
  /** 'add' for glows, sparks and fire; 'normal' for smoke and debris (default 'normal'). */
  blend?: 'normal' | 'add';
  /** Where particles appear round the emitter (default its exact point). */
  area?: SpawnArea;
  /** World px beyond the screen within which the emitter still spawns and draws (default 64). */
  cullMargin?: number;
  /** Share of particles kept under reduced effects or the battery saver (default 0.35). */
  thinFactor?: number;
  /** The budget shared with other emitters (default the engine-wide `particleBudget`). */
  budget?: ParticleBudget;
  /** Random source (default `Math.random`); a seeded one makes an emitter replayable. */
  random?: () => number;
}

/**
 * A source of smooth sprite particles for any art style: sparks, smoke, dust, magic. Particles live in world
 * coordinates, so moving the emitter (`x`, `y`) trails new ones behind it instead of dragging the old ones along.
 *
 * Drawn by one Pixi `ParticleContainer` (`view`): add it to a scene's `root`, and call `update(dt, camera)` once a
 * frame. Particle objects are pooled and their colour is written straight into Pixi's packed field, so a steady
 * emitter allocates nothing per frame. Spawning asks the shared `ParticleBudget` first, and off-screen emitters
 * neither spawn nor draw.
 */
export class Emitter {
  readonly view: ParticleContainer;
  x = 0;
  y = 0;
  /** Continuous emission on or off (bursts work either way). */
  emitting = false;
  private readonly sim: ParticleSim;
  private readonly pool: IParticle[] = [];
  private readonly budget: ParticleBudget;
  private readonly random: () => number;
  private readonly opts: EmitterOptions;
  private carry = 0;
  private destroyed = false;
  /** Set by the last `update`: whether the emitter's point was near the screen. */
  private near = true;

  constructor(options: EmitterOptions) {
    this.opts = options;
    this.sim = new ParticleSim(options.capacity ?? 256);
    this.budget = options.budget ?? particleBudget;
    this.random = options.random ?? Math.random;
    this.view = new ParticleContainer({
      texture: options.texture,
      dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: false },
    });
    this.view.blendMode = options.blend === 'add' ? 'add' : 'normal';
  }

  /** Particles alive now. */
  get live(): number {
    return this.sim.count;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  start(): this {
    this.emitting = true;
    return this;
  }

  /** Stops emitting; the particles in the air live out their lives. */
  stop(): this {
    this.emitting = false;
    this.carry = 0;
    return this;
  }

  /** `count` particles at once, at the emitter or at (x, y). Thinned under reduced effects; skipped off screen. */
  burst(count: number, x = this.x, y = this.y): void {
    if (this.destroyed || !this.near) return;
    this.emit(scaleCount(count, this.thin(), this.random()), x, y);
  }

  /** Advances by `dt` seconds. Pass the camera to skip spawning and drawing while everything is off screen. */
  update(dt: number, camera?: CameraLike): void {
    if (this.destroyed) return;
    const margin = this.opts.cullMargin ?? 64;
    this.near = camera ? inView(camera, this.x, this.y, margin) : true;
    const rate = this.opts.rate ?? 0;
    if (this.emitting && rate > 0 && this.near) {
      const due = dueParticles(rate * this.thin(), dt, this.carry);
      const n = Math.floor(due);
      this.carry = due - n;
      if (n > 0) this.emit(n, this.x, this.y);
    } else this.carry = 0;
    const o = this.opts;
    const died = this.sim.step(dt, o.gravityX ?? 0, o.gravityY ?? 0, o.drag ?? 0);
    if (died > 0) this.budget.give(died);
    this.draw(camera, margin);
  }

  /** Every particle gone at once (a scene change, a cancelled effect). */
  clear(): void {
    this.budget.give(this.sim.clear());
    this.draw(undefined, 0);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clear();
    this.destroyed = true;
    this.pool.length = 0;
    this.view.destroy();
  }

  private thin(): number {
    const s = engineSettings.getState();
    return s.reducedFx || s.batterySaver ? (this.opts.thinFactor ?? 0.35) : 1;
  }

  private emit(n: number, x: number, y: number): void {
    const sim = this.sim;
    const granted = this.budget.take(Math.min(n, sim.capacity - sim.count));
    const o = this.opts;
    const r = this.random;
    const base = o.angle ?? -Math.PI / 2;
    const spread = o.spread ?? Math.PI;
    for (let k = 0; k < granted; k++) {
      let px = x;
      let py = y;
      const area = o.area;
      if (area && 'radius' in area) {
        // the square root spreads them evenly over the disc instead of crowding the centre
        const d = Math.sqrt(r()) * area.radius;
        const a = r() * Math.PI * 2;
        px += Math.cos(a) * d;
        py += Math.sin(a) * d;
      } else if (area) {
        px += (r() - 0.5) * area.width;
        py += (r() - 0.5) * area.height;
      }
      const a = spreadAngle(base, spread, r());
      const v = sampleRange(o.speed ?? [40, 80], r());
      sim.spawn(px, py, Math.cos(a) * v, Math.sin(a) * v, sampleRange(o.lifetime ?? 1, r()), sampleRange(o.rotation ?? 0, r()), sampleRange(o.spin ?? 0, r()), r());
    }
  }

  private draw(camera: CameraLike | undefined, margin: number): void {
    const sim = this.sim;
    const list = this.view.particleChildren;
    if (list.length !== sim.count) {
      while (list.length < sim.count) list.push(this.pool.pop() ?? new Particle({ texture: this.opts.texture, anchorX: 0.5, anchorY: 0.5 }));
      while (list.length > sim.count) this.pool.push(list.pop()!);
      this.view.update();
    }
    const o = this.opts;
    const size = o.size ?? 1;
    const alpha = o.alpha ?? FADE_OUT;
    const tint = o.tint ?? 0xffffff;
    const variance = o.sizeVariance ?? 0;
    let anyIn = sim.count === 0;
    for (let i = 0; i < sim.count; i++) {
      const p = list[i]!;
      const t = sim.progress(i);
      const x = sim.x[i]!;
      const y = sim.y[i]!;
      p.x = x;
      p.y = y;
      p.rotation = sim.rot[i]!;
      const s = sampleCurve(size, t) * (1 + (sim.seed[i]! * 2 - 1) * variance);
      p.scaleX = s;
      p.scaleY = s;
      const c = sampleColor(tint, t);
      const al = Math.min(1, Math.max(0, sampleCurve(alpha, t)));
      // Pixi's packed field (BGR plus alpha in the top byte), written directly: the tint setter parses a colour each time
      p.color = (((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) + (((al * 255) | 0) << 24);
      if (!anyIn && (!camera || inView(camera, x, y, margin))) anyIn = true;
    }
    this.view.visible = anyIn && sim.count > 0;
  }
}

const FADE_OUT: Curve = { start: 1, end: 0 };
