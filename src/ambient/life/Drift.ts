import type { ViewRect } from '../../core/Camera';
import type { Image } from '../../core/Image';
import type { Stage } from '../../core/Stage';
import type { LifeAir, LifeBox, LifeSource } from './lifeMotion';

/**
 * How a drift moves:
 * - `leaf`: tumbles down through its frames, lands, lies a moment and is gone;
 * - `seed`: blown across the view on a slow wobble (dandelion seed, spores, ash on the wind);
 * - `ember`: rises, cooling through its frames, and goes out within a tile or three;
 * - `mote`: hangs in the air, barely moving, and winks out now and then (underground dust);
 * - `ash`: blown across like a seed, but from a source it lifts off the ground instead.
 */
export type DriftKind = 'leaf' | 'seed' | 'ember' | 'mote' | 'ash';

export interface DriftOptions {
  kind: DriftKind;
  /** Bodies in the pool; a body off screen is hidden and re-used, never freed. */
  count: number;
  /**
   * The looks, each a list of frames; body `i` wears `looks[i % looks.length]`. A leaf tumbles through its frames and
   * lies on the first; an ember cools from its first to its last; the others wear the first.
   */
  looks: readonly (readonly string[])[];
  /**
   * Where a body sets off from, if anywhere in particular: a canopy on screen a leaf falls from (and lands just under),
   * a patch of ground ash or embers lift off. Null when there is none in view now.
   */
  from?: LifeSource;
  /**
   * Only from `from` (a drift over certain ground): a body waits rather than drift in from the view's edge. Default
   * false — a leaf with no canopy in view still blows in from the edge.
   */
  sourceOnly?: boolean;
  /** Depth in the world layer (default 900_000: over the bodies and props, under the weather and the names). */
  depth?: number;
  /** Positions on whole world pixels (default true). */
  snap?: boolean;
  random?: () => number;
}

interface Mote {
  img: Image;
  look: readonly string[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Falling and rising kinds: the line it lands on or dies at. A mote: unused. */
  ground: number;
  /** -1 waiting for a spawn, 0 in the air, otherwise when it landed. */
  landedAt: number;
  /** Lifted off a source (ash, embers) rather than blown across. */
  rising: boolean;
  seed: number;
}

/** Bodies a frame refill at most this share of the time: a pool comes back a few at a time, not as one sheet. */
const REFILL_CHANCE = 0.08;
/** How long a fallen leaf lies before it is gone (ms). */
const LEAF_LIES_MS = 1600;

/**
 * One kind of thing on the air: a fixed pool that lives only inside the camera's view, each body on whole world
 * pixels and flipped between painted frames rather than rotated (a rotated pixel leaf reads as a different art style).
 * Feed it the frame's view and the air; `enabled` false hides it (a reduced-effects setting).
 */
export class Drift {
  private readonly motes: Mote[] = [];
  private readonly kind: DriftKind;
  private readonly snap: boolean;
  private readonly random: () => number;

  constructor(
    stage: Stage,
    private readonly options: DriftOptions,
  ) {
    this.kind = options.kind;
    this.snap = options.snap ?? true;
    this.random = options.random ?? Math.random;
    if (!options.looks.length) return;
    for (let i = 0; i < options.count; i++) {
      const look = options.looks[i % options.looks.length]!;
      const img = stage.add.image(0, 0, look[0]!).setOrigin(0, 0).setDepth(options.depth ?? 900_000).setVisible(false);
      this.motes.push({ img, look, x: 0, y: 0, vx: 0, vy: 0, ground: 0, landedAt: -1, rising: false, seed: this.random() * 1000 });
    }
  }

  /** `now` and `dt` in ms. */
  update(now: number, dt: number, view: ViewRect, air: LifeAir, enabled = true): void {
    const s = dt / 1000;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i]!;
      if (!enabled) {
        if (m.img.visible) m.img.setVisible(false);
        m.landedAt = -1;
        continue;
      }
      const out = m.x < view.x - 40 || m.x > view.right + 40 || m.y < view.y - 60 || m.y > view.bottom + 30;
      if (m.landedAt < 0 || out) {
        if (this.random() > REFILL_CHANCE || !this.spawn(m, view, air.wind, m.landedAt < 0 && this.random() < 0.5)) {
          if (m.img.visible) m.img.setVisible(false);
          m.landedAt = -1;
          continue;
        }
        m.img.setVisible(true);
      }
      this.step(m, now, s);
      m.img.setPosition(this.snap ? Math.round(m.x) : m.x, this.snap ? Math.round(m.y) : m.y);
    }
  }

  destroy(): void {
    for (const m of this.motes) m.img.destroy();
    this.motes.length = 0;
  }

  /** `anywhere`: a first fill lands bodies all over the view, not only at its edge, so a scene opens already alive. */
  private spawn(m: Mote, view: ViewRect, wind: number, anywhere: boolean): boolean {
    const r = this.random;
    m.landedAt = 0;
    m.rising = false;
    const box = this.options.from?.(view, r) ?? null;
    if (box) return this.spawnFrom(m, box, wind);
    if (this.options.sourceOnly) return false;
    m.x = view.x - 20 + r() * (view.width + 30);
    if (this.kind === 'ember') {
      m.y = anywhere ? view.y + r() * view.height : view.bottom + 2;
      m.vx = wind * 8 * r();
      m.vy = -10 - r() * 12;
      m.ground = view.y + r() * view.height * 0.6;
    } else if (this.kind === 'mote') {
      m.y = view.y + r() * view.height;
      m.vx = (r() - 0.5) * 4;
      m.vy = (r() - 0.5) * 3;
      m.ground = 0;
    } else {
      m.y = anywhere ? view.y + r() * view.height : view.y - 6 - r() * 20;
      m.vx = 4 + wind * 16 * (0.5 + r());
      m.vy = 6 + r() * 8;
      m.ground = view.bottom + 10;
    }
    return true;
  }

  private spawnFrom(m: Mote, b: LifeBox, wind: number): boolean {
    const r = this.random;
    m.x = b.x + r() * (b.w ?? 0);
    m.y = b.y + r() * (b.h ?? 0);
    if (this.kind === 'ember' || this.kind === 'ash') {
      m.rising = true;
      m.vx = 2 + wind * 10 * r();
      if (this.kind === 'ember') {
        // off the melt: quicker than ash, and out within a tile or three, the way sparks die in the air
        m.vy = -10 - r() * 12;
        m.ground = m.y - 16 - r() * 30;
      } else {
        m.vy = -3 - r() * 5;
        m.ground = m.y - 30 - r() * 40;
      }
      return true;
    }
    m.vx = 2 + wind * 14 * (0.5 + r());
    m.vy = 9 + r() * 7;
    // it lands a little way below what it left: under the tree, or in the road beside it
    m.ground = b.y + (b.h ?? 0) + 10 + r() * 22;
    return true;
  }

  private step(m: Mote, now: number, s: number): void {
    const kind = this.kind;
    const look = m.look;
    if (kind === 'leaf') {
      if (m.landedAt > 0) {
        if (now - m.landedAt > LEAF_LIES_MS) m.landedAt = -1;
        return;
      }
      m.x += (m.vx + Math.sin(now / 260 + m.seed) * 10) * s;
      m.y += m.vy * s;
      m.img.setTexture(look[Math.floor(now / 140 + m.seed) % look.length]!);
      if (m.y >= m.ground) {
        m.y = m.ground;
        m.landedAt = now;
        m.img.setTexture(look[0]!);
      }
      return;
    }
    if (kind === 'ember') {
      m.x += (m.vx + Math.sin(now / 300 + m.seed) * 4) * s;
      m.y += m.vy * s;
      // hottest first: 20 px or more from where it dies, then cooler, then the last frame past it
      const left = m.y - m.ground;
      const frame = left < 0 ? 2 : left < 20 ? 1 : 0;
      m.img.setTexture(look[Math.min(look.length - 1, frame)]!);
      if (left < -12) m.landedAt = -1;
      return;
    }
    if (m.rising) {
      m.x += (m.vx + Math.sin(now / 500 + m.seed) * 3) * s;
      m.y += m.vy * s;
      if (m.y < m.ground) m.landedAt = -1;
      return;
    }
    const wobble = kind === 'mote' ? 2 : 7;
    m.x += (m.vx + Math.sin(now / 700 + m.seed) * wobble) * s;
    m.y += (m.vy + Math.cos(now / 900 + m.seed) * (kind === 'mote' ? 2 : 1)) * s;
    if (kind !== 'mote' && m.y > m.ground) m.landedAt = -1;
    if (kind === 'mote' && this.random() < s / 9) m.landedAt = -1;
  }
}
