import type { ViewRect } from '../../core/Camera';
import type { Image } from '../../core/Image';
import type { Stage } from '../../core/Stage';
import { birdFrame, flockSlot, type LifeAir } from './lifeMotion';

export interface BirdsOptions {
  /** Birds in a flock, [least, most]; never more than `maxFlock`. */
  flock: readonly [number, number];
  /** Seconds between flocks, [least, most]. */
  everyS: readonly [number, number];
  /** The two frames, seen from above: wings raised (a V), then the downstroke. */
  frames: readonly [string, string];
  /** A small shadow on the ground far below each bird: it is what tells the eye how high they are. */
  shadow?: string;
  /** The pool's size (default 6). */
  maxFlock?: number;
  /** Depth of the birds (default 950_000: over every prop and body, under the names). */
  depth?: number;
  /** Depth of their shadows (default -999_980: on the ground, under the bodies). */
  shadowDepth?: number;
  /** Past this `night` no flock sets off (default 0.5). */
  maxNight?: number;
  /** The first flock comes this many ms after the first update, [least, most] (default [3000, 9000]). */
  firstMs?: readonly [number, number];
  snap?: boolean;
  random?: () => number;
}

interface Bird {
  img: Image;
  shadow: Image | null;
  dx: number;
  dy: number;
  flap: number;
}

/**
 * A flock crossing the sky now and then: a few painted birds in a loose V flying straight across the camera's view,
 * wings beating on their own clocks, each with its shadow on the ground below. Not at night.
 */
export class Birds {
  private readonly birds: Bird[] = [];
  private readonly snap: boolean;
  private readonly random: () => number;
  private active = 0;
  private nextAt = Number.NaN;
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private altitude = 60;

  constructor(
    stage: Stage,
    private readonly options: BirdsOptions,
  ) {
    this.snap = options.snap ?? true;
    this.random = options.random ?? Math.random;
    const n = options.maxFlock ?? 6;
    for (let i = 0; i < n; i++) {
      const img = stage.add.image(0, 0, options.frames[0]).setOrigin(0.5, 0.5).setDepth(options.depth ?? 950_000).setVisible(false);
      const shadow = options.shadow
        ? stage.add.image(0, 0, options.shadow).setOrigin(0.5, 0.5).setDepth(options.shadowDepth ?? -999_980).setVisible(false)
        : null;
      this.birds.push({ img, shadow, dx: 0, dy: 0, flap: this.random() * 1000 });
    }
  }

  /** Whether a flock is crossing now. */
  get flying(): boolean {
    return this.active > 0;
  }

  update(now: number, dt: number, view: ViewRect, air: LifeAir, enabled = true): void {
    if (Number.isNaN(this.nextAt)) {
      const [lo, hi] = this.options.firstMs ?? [3000, 9000];
      this.nextAt = now + lo + this.random() * (hi - lo);
    }
    if (!enabled) {
      if (this.active) this.land();
      return;
    }
    if (!this.active) {
      if (now >= this.nextAt && air.night < (this.options.maxNight ?? 0.5)) this.launch(now, view, air.wind);
      return;
    }
    const s = dt / 1000;
    this.x += this.vx * s;
    this.y += this.vy * s;
    const [up, down] = this.options.frames;
    for (let i = 0; i < this.active; i++) {
      const b = this.birds[i]!;
      const x = this.snap ? Math.round(this.x + b.dx) : this.x + b.dx;
      const y = this.snap ? Math.round(this.y + b.dy) : this.y + b.dy;
      b.img.setTexture(birdFrame(now, b.flap) ? down : up).setFlipX(this.vx < 0);
      b.img.setPosition(x, y);
      b.shadow?.setPosition(x + Math.round(this.altitude * 0.25), y + Math.round(this.altitude));
    }
    if (this.x < view.x - 120 || this.x > view.right + 120 || this.y < view.y - 120 || this.y > view.bottom + 120) this.land();
  }

  destroy(): void {
    for (const b of this.birds) {
      b.img.destroy();
      b.shadow?.destroy();
    }
    this.birds.length = 0;
    this.active = 0;
  }

  private launch(now: number, view: ViewRect, wind: number): void {
    const r = this.random;
    const [lo, hi] = this.options.flock;
    this.active = Math.min(this.birds.length, lo + Math.floor(r() * (hi - lo + 1)));
    // a wind from the west sends more of them east
    const fromLeft = r() < 0.5 + wind * 0.3;
    const speed = 34 + r() * 18 + wind * 14;
    this.x = fromLeft ? view.x - 30 : view.right + 30;
    this.y = view.y + view.height * (0.1 + r() * 0.7);
    this.vx = fromLeft ? speed : -speed;
    this.vy = (r() - 0.5) * speed * 0.35;
    this.altitude = 46 + r() * 40;
    for (let i = 0; i < this.active; i++) {
      const b = this.birds[i]!;
      const slot = flockSlot(i, this.vx, r(), r());
      b.dx = slot.dx;
      b.dy = slot.dy;
      b.img.setVisible(true);
      b.shadow?.setVisible(true);
    }
    const [elo, ehi] = this.options.everyS;
    this.nextAt = now + (elo + r() * (ehi - elo)) * 1000;
  }

  private land(): void {
    for (const b of this.birds) {
      b.img.setVisible(false);
      b.shadow?.setVisible(false);
    }
    this.active = 0;
  }
}
