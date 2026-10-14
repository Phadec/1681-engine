import { Container, Sprite, type Texture } from 'pixi.js';
import type { ViewRect } from '../../core/Camera';
import type { Stage } from '../../core/Stage';
import { fireflyGlow, fireflyOffset, firefliesOut, type LifeAir, type LifeSource } from './lifeMotion';

export interface FirefliesOptions {
  count: number;
  /** The two frames: a dim pixel, and the glow. */
  frames: readonly [dim: string, lit: string];
  /** Somewhere in view to hover round (the water's edge, the feet of trees), or null when none is on screen. */
  home: LifeSource;
  /**
   * Where the layer goes. Default `'screen'`: on the screen layer, following the camera, so it can be laid **over** a
   * darkness drawn there (`NightShade`, `Darkness`) instead of being darkened with the world under it — add it after
   * the darkness. `'world'`: in the world layer at `depth`, for a game with no darkness over its world.
   */
  layer?: 'screen' | 'world';
  /** World-layer depth when `layer` is `'world'` (default 900_000). */
  depth?: number;
  snap?: boolean;
  random?: () => number;
}

interface Fly {
  sprite: Sprite;
  homeX: number;
  homeY: number;
  seed: number;
  home: boolean;
}

/**
 * Fireflies at night: single pixels drifting slowly round homes on screen, each lighting up and going out on its own
 * clock. How many are out grows with the dark (none before night 0.5, all by 0.85). They are a light, so by default
 * their layer sits on the screen and follows the camera (`Camera.follow` copies the world layer's transform, shake
 * included, once the frame's camera is known).
 */
export class Fireflies {
  readonly layer = new Container();
  private readonly flies: Fly[] = [];
  private readonly dim: Texture;
  private readonly lit: Texture;
  private readonly onScreen: boolean;
  private readonly snap: boolean;
  private readonly random: () => number;

  constructor(
    private readonly stage: Stage,
    private readonly options: FirefliesOptions,
  ) {
    this.dim = stage.textures.get(options.frames[0]);
    this.lit = stage.textures.get(options.frames[1]);
    this.onScreen = (options.layer ?? 'screen') === 'screen';
    this.snap = options.snap ?? true;
    this.random = options.random ?? Math.random;
    if (this.onScreen) {
      stage.screen.addChild(this.layer);
      stage.cameras.main.follow(this.layer);
    } else {
      this.layer.zIndex = options.depth ?? 900_000;
      stage.world.addChild(this.layer);
    }
    this.layer.visible = false;
    for (let i = 0; i < options.count; i++) {
      const sprite = new Sprite(this.dim);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.layer.addChild(sprite);
      this.flies.push({ sprite, homeX: 0, homeY: 0, seed: this.random() * 10_000, home: false });
    }
  }

  update(now: number, view: ViewRect, air: LifeAir, enabled = true): void {
    if (!this.flies.length) return;
    const out = !enabled || air.night < 0.5;
    this.layer.visible = !out;
    if (out) {
      for (const f of this.flies) f.home = false;
      return;
    }
    const active = firefliesOut(this.flies.length, air.night);
    for (let i = 0; i < this.flies.length; i++) {
      const f = this.flies[i]!;
      const away = f.homeX < view.x - 30 || f.homeX > view.right + 30 || f.homeY < view.y - 30 || f.homeY > view.bottom + 30;
      if (i >= active || (f.home && away)) {
        f.home = false;
        f.sprite.visible = false;
        continue;
      }
      if (!f.home && (this.random() > 0.05 || !this.settle(f, view))) continue;
      const t = (now + f.seed) / 1000;
      const glow = fireflyGlow(t);
      f.sprite.visible = glow > 0;
      if (!glow) continue;
      f.sprite.texture = glow === 2 ? this.lit : this.dim;
      const { dx, dy } = fireflyOffset(t);
      const x = f.homeX + dx;
      const y = f.homeY + dy;
      f.sprite.position.set(this.snap ? Math.round(x) : x, this.snap ? Math.round(y) : y);
    }
  }

  destroy(): void {
    if (this.onScreen) this.stage.cameras.main.unfollow(this.layer);
    this.layer.destroy({ children: true });
    this.flies.length = 0;
  }

  private settle(f: Fly, view: ViewRect): boolean {
    const h = this.options.home(view, this.random);
    if (!h) return false;
    f.homeX = h.x + (h.w ?? 0) / 2 + (this.random() - 0.5) * 24;
    f.homeY = h.y + (h.h ?? 0) / 2 - 4 - this.random() * 16;
    f.home = true;
    return true;
  }
}
