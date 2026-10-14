import type { ViewRect } from '../../core/Camera';
import type { Image } from '../../core/Image';
import type { Stage } from '../../core/Stage';
import type { LifeAir, LifeSource } from './lifeMotion';

export interface ButterfliesOptions {
  count: number;
  /** Each tone's two frames, wings open then shut; butterfly `i` wears `looks[i % looks.length]`. */
  looks: readonly (readonly [open: string, shut: string])[];
  /** A flower patch in view to settle round, or null when none is on screen. */
  home: LifeSource;
  /** Depth in the world layer (default 900_000). */
  depth?: number;
  /** Past this `night` they are gone (default 0.4). */
  maxNight?: number;
  snap?: boolean;
  random?: () => number;
}

interface Butterfly {
  img: Image;
  look: readonly [string, string];
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  retargetAt: number;
  seed: number;
  home: boolean;
}

/**
 * Butterflies by day round the flowers on screen: each settles on a patch in view and wanders round it in short
 * jinks, wings opening and shutting on their own beat, bobbing a pixel over the bloom. They leave when the night
 * comes in, and where `home` finds nothing they are simply not drawn.
 */
export class Butterflies {
  private readonly flies: Butterfly[] = [];
  private readonly snap: boolean;
  private readonly random: () => number;

  constructor(
    stage: Stage,
    private readonly options: ButterfliesOptions,
  ) {
    this.snap = options.snap ?? true;
    this.random = options.random ?? Math.random;
    if (!options.looks.length) return;
    for (let i = 0; i < options.count; i++) {
      const look = options.looks[i % options.looks.length]!;
      const img = stage.add.image(0, 0, look[0]).setOrigin(0.5, 1).setDepth(options.depth ?? 900_000).setVisible(false);
      this.flies.push({ img, look, homeX: 0, homeY: 0, x: 0, y: 0, tx: 0, ty: 0, retargetAt: 0, seed: this.random() * 1000, home: false });
    }
  }

  update(now: number, dt: number, view: ViewRect, air: LifeAir, enabled = true): void {
    const s = dt / 1000;
    const r = this.random;
    const awake = enabled && air.night < (this.options.maxNight ?? 0.4);
    for (const b of this.flies) {
      const away = b.homeX < view.x - 40 || b.homeX > view.right + 40 || b.homeY < view.y - 40 || b.homeY > view.bottom + 40;
      if (!awake || (b.home && away)) {
        b.home = false;
        if (b.img.visible) b.img.setVisible(false);
        continue;
      }
      if (!b.home) {
        if (r() > 0.02 || !this.settle(b, view)) continue;
        b.img.setVisible(true);
      }
      if (now >= b.retargetAt) {
        b.tx = b.homeX + (r() - 0.5) * 34 + air.wind * 6;
        b.ty = b.homeY - 4 - r() * 14;
        b.retargetAt = now + 500 + r() * 1400;
      }
      const k = Math.min(1, s * 2.4);
      b.x += (b.tx - b.x) * k;
      b.y += (b.ty - b.y) * k;
      const open = Math.floor((now + b.seed) / 90) % 3 !== 0;
      const bob = Math.sin((now + b.seed) / 160) > 0 ? 1 : 0;
      b.img.setTexture(open ? b.look[0] : b.look[1]);
      b.img.setPosition(this.snap ? Math.round(b.x) : b.x, (this.snap ? Math.round(b.y) : b.y) - bob);
    }
  }

  destroy(): void {
    for (const b of this.flies) b.img.destroy();
    this.flies.length = 0;
  }

  private settle(b: Butterfly, view: ViewRect): boolean {
    const f = this.options.home(view, this.random);
    if (!f) return false;
    b.homeX = f.x + (f.w ?? 0) / 2;
    b.homeY = f.y + (f.h ?? 0) / 2;
    b.x = b.tx = b.homeX + (this.random() - 0.5) * 16;
    b.y = b.ty = b.homeY - 6 - this.random() * 6;
    b.home = true;
    return true;
  }
}
