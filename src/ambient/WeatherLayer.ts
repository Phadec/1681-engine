import { Sprite, Texture } from 'pixi.js';
import type { ViewRect } from '../core/Camera';
import type { Image } from '../core/Image';
import type { Stage } from '../core/Stage';
import type { WeatherState } from './weather';

/**
 * How one kind of weather moves:
 * - `fall`: streaks falling at a slant onto a ground line somewhere in view, half of them leaving a two-frame splash
 *   (rain);
 * - `flake`: bits drifting down and swaying as they fall, each on its own phase (snow, ash, petals);
 * - `bank`: a few wide sprites drifting slowly sideways, laid over the bodies (fog, mist, smoke).
 */
export type WeatherMotion = 'fall' | 'flake' | 'bank';

export interface WeatherLook {
  motion: WeatherMotion;
  /** Particles at full strength; fewer show as the weather thins. Keep it in the low hundreds on a phone. */
  max: number;
  /** Texture keys, handed out in turn (repeat a key to make it commoner). */
  keys: readonly string[];
  /** `fall` only: the splash's two frames. Without them a drop simply vanishes where it lands. */
  splash?: readonly [string, string];
  /** World px a second, [lo, hi] each (defaults suit each motion). */
  vx?: readonly [number, number];
  vy?: readonly [number, number];
  /** `flake` only: how far (px) a flake sways either side as it falls (default 4). */
  sway?: number;
  /** A screen-wide tint the kind lays over everything (fog is mostly tint), at `tintAlpha` × strength. */
  tint?: number;
  tintAlpha?: number;
}

export interface WeatherLayerOptions<K extends string> {
  looks: Readonly<Partial<Record<K, WeatherLook>>>;
  /** Depth of falling particles in the world layer: over the bodies, under the names (default 900_001). */
  depth?: number;
  /** Depth of fog banks (default 900_010). */
  bankDepth?: number;
  /** Depth of splashes: with the ground effects, so a body standing in the rain is not splashed over (default 0). */
  splashDepth?: number;
  /** Round positions to whole world pixels (default true): pixel art wants it, smooth art may not. */
  snap?: boolean;
  /** Where randomness comes from (default `Math.random`); the look of a shower need not be shared between clients. */
  random?: () => number;
}

interface Drop {
  img: Image;
  key: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** `fall`: the ground line it lands on. `flake`: its sway's phase. */
  ground: number;
  /** `fall`: when its splash began (0 while it still falls). */
  splashAt: number;
}

const SPLASH_MS = 80;
const DEFAULT_V: Record<WeatherMotion, { vx: readonly [number, number]; vy: readonly [number, number] }> = {
  fall: { vx: [-48, -38], vy: [250, 320] },
  flake: { vx: [4, 12], vy: [14, 30] },
  bank: { vx: [3, 8], vy: [0, 0] },
};

/**
 * The weather on screen: a capped pool of particles that lives only inside the camera's view, plus a light screen
 * tint for the kinds that change the air. Feed it a `WeatherState` each frame (from `weatherAt`, so it fades in and
 * out exactly when every other client's does); the pool is rebuilt only when the kind changes, and a thinning shower
 * hides particles rather than freeing them.
 *
 * The art is the game's: name texture keys per kind (the pixel module's `paintWeatherArt` paints a set in whole
 * pixels).
 */
export class WeatherLayer<K extends string> {
  private readonly drops: Drop[] = [];
  private kind: K | 'clear' = 'clear';
  private look: WeatherLook | undefined;
  private readonly tint = new Sprite({ texture: Texture.WHITE });
  private readonly depth: number;
  private readonly bankDepth: number;
  private readonly splashDepth: number;
  private readonly snap: boolean;
  private readonly random: () => number;

  constructor(
    private readonly stage: Stage,
    private readonly options: WeatherLayerOptions<K>,
  ) {
    this.depth = options.depth ?? 900_001;
    this.bankDepth = options.bankDepth ?? 900_010;
    this.splashDepth = options.splashDepth ?? 0;
    this.snap = options.snap ?? true;
    this.random = options.random ?? Math.random;
    this.tint.visible = false;
    stage.screen.addChild(this.tint);
  }

  /**
   * `now` in ms, `dt` the frame's ms, `view` the camera's world view. `share` (0..1) thins the pool on top of the
   * weather's own strength (a reduced-effects setting keeps half).
   */
  update(now: number, dt: number, view: ViewRect, weather: WeatherState<K>, share = 1): void {
    if (weather.kind !== this.kind) this.rebuild(weather.kind, view);
    const look = this.look;
    const tintAlpha = (look?.tintAlpha ?? 0) * weather.intensity;
    this.tint.visible = tintAlpha > 0.004;
    if (this.tint.visible) {
      this.tint.tint = look?.tint ?? 0xffffff;
      this.tint.alpha = tintAlpha;
      this.tint.width = this.stage.width;
      this.tint.height = this.stage.height;
    }
    if (!look) return;
    const active = Math.round(this.drops.length * weather.intensity * Math.max(0, Math.min(1, share)));
    const s = dt / 1000;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i]!;
      if (i >= active) {
        if (d.img.visible) d.img.setVisible(false);
        continue;
      }
      if (!d.img.visible) this.spawn(d, look, view, false);
      if (look.motion === 'fall') this.stepFall(d, look, now, s, view);
      else if (look.motion === 'bank') this.stepBank(d, look, s, view, weather.intensity);
      else this.stepFlake(d, look, now, s, view);
    }
  }

  private rebuild(kind: K | 'clear', view: ViewRect): void {
    for (const d of this.drops) d.img.destroy();
    this.drops.length = 0;
    this.kind = kind;
    this.look = kind === 'clear' ? undefined : this.options.looks[kind];
    const look = this.look;
    if (!look || !look.keys.length) return;
    for (let i = 0; i < look.max; i++) {
      const key = look.keys[i % look.keys.length]!;
      const img = this.stage.add.image(0, 0, key).setOrigin(0, 0).setVisible(false);
      const d: Drop = { img, key, x: 0, y: 0, vx: 0, vy: 0, ground: 0, splashAt: 0 };
      this.drops.push(d);
      // the first fill is spread over the whole view, so a shower starting does not arrive as one falling sheet
      this.spawn(d, look, view, true);
      img.setVisible(false);
    }
  }

  private between(r: readonly [number, number]): number {
    return r[0] + (r[1] - r[0]) * this.random();
  }

  private place(d: Drop): void {
    d.img.setPosition(this.snap ? Math.round(d.x) : d.x, this.snap ? Math.round(d.y) : d.y);
  }

  private spawn(d: Drop, look: WeatherLook, view: ViewRect, anywhere: boolean): void {
    const r = this.random;
    const v = DEFAULT_V[look.motion];
    const x = view.x - 30 + r() * (view.width + 60);
    d.vx = this.between(look.vx ?? v.vx);
    d.vy = this.between(look.vy ?? v.vy);
    if (look.motion === 'fall') {
      d.ground = view.y + r() * (view.height + 12);
      d.y = anywhere ? view.y - 10 + r() * (d.ground - view.y + 10) : d.ground - 30 - r() * view.height;
      d.x = x;
      d.splashAt = 0;
      d.img.setTexture(d.key).setDepth(this.depth).setAlpha(1);
    } else if (look.motion === 'bank') {
      d.x = anywhere ? x : view.x - d.img.width;
      d.y = view.y + r() * view.height;
      d.img.setDepth(this.bankDepth);
    } else {
      d.x = x;
      d.y = anywhere ? view.y + r() * view.height : view.y - 4 - r() * 20;
      d.ground = r() * Math.PI * 2;
      d.img.setDepth(this.depth);
    }
    d.img.setVisible(true);
  }

  private stepFall(d: Drop, look: WeatherLook, now: number, s: number, view: ViewRect): void {
    if (d.splashAt) {
      const t = now - d.splashAt;
      if (t > SPLASH_MS * 2) this.spawn(d, look, view, false);
      else if (t > SPLASH_MS && look.splash) d.img.setTexture(look.splash[1]);
      return;
    }
    d.x += d.vx * s;
    d.y += d.vy * s;
    if (d.y >= d.ground) {
      // every other drop splashes on the ground it hit; the rest vanish into it
      if (look.splash && this.random() < 0.5) {
        d.splashAt = now;
        d.img.setTexture(look.splash[0]).setDepth(this.splashDepth);
        d.x -= d.img.width / 2;
        d.y = d.ground - 1;
        this.place(d);
      } else this.spawn(d, look, view, false);
      return;
    }
    this.place(d);
  }

  private stepFlake(d: Drop, look: WeatherLook, now: number, s: number, view: ViewRect): void {
    d.x += d.vx * s;
    d.y += d.vy * s;
    if (d.y > view.bottom + 4 || d.x > view.right + 30 || d.x < view.x - 40) {
      this.spawn(d, look, view, false);
      return;
    }
    // the sway is added at draw time, so it never drifts the flake off its line
    const sway = Math.sin(now / 900 + d.ground) * (look.sway ?? 4);
    const x = d.x + sway;
    d.img.setPosition(this.snap ? Math.round(x) : x, this.snap ? Math.round(d.y) : d.y);
  }

  private stepBank(d: Drop, look: WeatherLook, s: number, view: ViewRect, intensity: number): void {
    d.x += d.vx * s;
    if (d.x > view.right + 10 || d.y < view.y - 20 || d.y > view.bottom + 10) this.spawn(d, look, view, d.x <= view.right + 10);
    d.img.setAlpha(0.35 + 0.5 * intensity);
    this.place(d);
  }

  destroy(): void {
    for (const d of this.drops) d.img.destroy();
    this.drops.length = 0;
    this.tint.destroy();
  }
}
