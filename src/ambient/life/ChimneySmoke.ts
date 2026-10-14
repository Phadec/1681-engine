import type { ViewRect } from '../../core/Camera';
import type { Image } from '../../core/Image';
import type { Stage } from '../../core/Stage';
import { puffOffset, type LifeAir, type LifePoint } from './lifeMotion';

export interface ChimneySmokeOptions {
  /** The chimneys' mouths in world pixels. */
  mouths: readonly LifePoint[];
  /** The puff's frames from young to old (it grows through them and dithers away). */
  frames: readonly string[];
  /** Puffs in each chimney's pool (default 7). */
  puffs?: number;
  /** A puff every this many ms, give or take 30% (default 650). */
  puffEveryMs?: number;
  /** A puff's life (ms, default 4600). */
  lifeMs?: number;
  /** World px a second it climbs (default 7). */
  rise?: number;
  /** World px a second the wind leans it (default 9). */
  drift?: number;
  /** Depth in the world layer (default 900_000). */
  depth?: number;
  snap?: boolean;
  random?: () => number;
}

interface Puff {
  img: Image;
  born: number;
  seed: number;
}

interface Chimney {
  x: number;
  y: number;
  puffs: Puff[];
  next: number;
}

/**
 * Smoke rising from chimneys: each mouth lets out a puff every so often that climbs, grows through its frames, leans
 * downwind and is gone. Only mouths on screen puff; a mouth that leaves the view drops its puffs at once.
 */
export class ChimneySmoke {
  private readonly chimneys: Chimney[] = [];
  private readonly snap: boolean;
  private readonly random: () => number;

  constructor(
    stage: Stage,
    private readonly options: ChimneySmokeOptions,
  ) {
    this.snap = options.snap ?? true;
    this.random = options.random ?? Math.random;
    if (!options.frames.length) return;
    const n = options.puffs ?? 7;
    for (const m of options.mouths) {
      const puffs: Puff[] = [];
      for (let i = 0; i < n; i++) {
        const img = stage.add.image(0, 0, options.frames[0]!).setOrigin(0.5, 1).setDepth(options.depth ?? 900_000).setVisible(false);
        puffs.push({ img, born: -1, seed: this.random() });
      }
      this.chimneys.push({ x: Math.round(m.x), y: Math.round(m.y), puffs, next: 0 });
    }
  }

  update(now: number, view: ViewRect, air: LifeAir, enabled = true): void {
    const o = this.options;
    const every = o.puffEveryMs ?? 650;
    const life = o.lifeMs ?? 4600;
    const motion = { rise: o.rise ?? 7, drift: o.drift ?? 9 };
    const frames = o.frames;
    for (const c of this.chimneys) {
      // a puff climbs and leans, so a mouth just below the view or beside it still shows its smoke
      const inView = enabled && c.x > view.x - 40 && c.x < view.right + 40 && c.y > view.y - 20 && c.y < view.bottom + 120;
      if (!inView) {
        for (const p of c.puffs) {
          if (p.born >= 0) p.img.setVisible(false);
          p.born = -1;
        }
        continue;
      }
      if (now >= c.next) {
        const free = c.puffs.find((p) => p.born < 0);
        if (free) {
          free.born = now;
          free.seed = this.random();
          free.img.setVisible(true);
        }
        c.next = now + every * (0.7 + this.random() * 0.6);
      }
      for (const p of c.puffs) {
        if (p.born < 0) continue;
        const age = (now - p.born) / life;
        if (age >= 1) {
          p.born = -1;
          p.img.setVisible(false);
          continue;
        }
        const { dx, dy } = puffOffset((now - p.born) / 1000, age, p.seed, air.wind, motion);
        p.img.setTexture(frames[Math.min(frames.length - 1, Math.floor(age * frames.length))]!);
        p.img.setPosition(this.snap ? Math.round(c.x + dx) : c.x + dx, this.snap ? Math.round(c.y + dy) : c.y + dy);
      }
    }
  }

  destroy(): void {
    for (const c of this.chimneys) for (const p of c.puffs) p.img.destroy();
    this.chimneys.length = 0;
  }
}
