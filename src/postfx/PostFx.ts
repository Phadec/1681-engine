import { Container, Rectangle, Sprite, Texture, type Filter } from 'pixi.js';
import { easeByName, type EaseFn } from '../core/eases';
import type { Engine } from '../engine/Engine';
import { engineSettings } from '../settings';
import { ColorAdjustFilter } from './ColorAdjustFilter';
import { FxAnimator } from './fxAnimator';
import { ShockwaveFilter, type ShockwaveOptions } from './ShockwaveFilter';

export interface PostFxOptions {
  /**
   * What the effects lie over: 'all' (default) the whole picture, HUD included; 'world' the camera's layer only, so
   * the HUD stays sharp; or any container.
   */
  layer?: 'all' | 'world' | Container;
  /**
   * Fills the screen behind the picture with this colour (default the renderer's background when `layer` is 'all').
   * Effects only see what is drawn: without a backdrop the empty background stays untouched by a vignette or a flash.
   * `false` for none.
   */
  backdrop?: number | false;
  /** Skip flashes and shockwaves while the player asked for reduced effects (default true). */
  honourReducedFx?: boolean;
}

export interface FlashOptions {
  color?: number;
  /** Peak strength, 0–1 (default 0.6). */
  strength?: number;
  ms?: number;
}

export interface ShockwaveRun extends ShockwaveOptions {
  /** How far the ring travels, as a share of the screen's height (default 0.6). */
  reach?: number;
  ms?: number;
}

/**
 * Full-screen effects over a game: a chain of filters (vignette, bloom, a colour grade, CRT, pixelate…) laid over the
 * picture in the order added, switched on and off one by one, and short effects that come and go — a flash, a
 * shockwave, any uniform animated over time. One per engine is plenty; give it to the scenes that want it.
 *
 * ```ts
 * const post = PostFx.forEngine(engine);
 * const vignette = post.add(new VignetteFilter({ strength: 0.4 }));
 * post.add(new BloomFilter({ threshold: 0.75 }));
 * post.flash({ color: 0xffffff, ms: 120 }); // a hit
 * post.shockwave(x, y); // screen pixels: an explosion
 * post.animate((v) => (vignette.strength = v), 0.4, 0.8, 300, 'Sine.InOut'); // a heartbeat
 * ```
 */
export class PostFx {
  readonly animator = new FxAnimator();
  private readonly chain: { filter: Filter; on: boolean }[] = [];
  private transient: Filter[] = [];
  private colorFx: ColorAdjustFilter | null = null;
  private backdropSprite: Sprite | null = null;
  private offFrame: (() => void) | null = null;
  /** The screen in the target's own coordinates: the filtered area, refreshed every frame as a camera moves. */
  private readonly area = new Rectangle();

  constructor(
    readonly target: Container,
    /** The screen rectangle, live (the renderer's `screen`): what is filtered, and how screen points map to it. */
    private readonly screen: Rectangle,
    private readonly options: PostFxOptions = {},
  ) {
    this.fitArea();
    target.filterArea = this.area;
    // the backdrop is laid in screen space: only over a target that is not moved by a camera
    if (options.backdrop !== false && options.backdrop !== undefined) this.setBackdrop(options.backdrop);
  }

  /** A `PostFx` over an engine's picture, stepped on its frames. */
  static forEngine(engine: Engine, options: PostFxOptions = {}): PostFx {
    const layer = options.layer ?? 'all';
    const target = layer === 'all' ? engine.app.stage : layer === 'world' ? engine.stage.world : layer;
    const backdrop = options.backdrop ?? (layer === 'all' ? engine.app.renderer.background.color.toNumber() : false);
    const fx = new PostFx(target, engine.app.screen, { ...options, backdrop });
    fx.offFrame = engine.events.on('frame', ({ dt }) => fx.update(dt * 1000));
    return fx;
  }

  /** Adds an effect at the end of the chain (or at `index`) and returns it. */
  add<T extends Filter>(filter: T, index = this.chain.length): T {
    this.chain.splice(index, 0, { filter, on: true });
    this.apply();
    return filter;
  }

  /** Takes an effect out (it is not destroyed: add it back later, or destroy it yourself). */
  remove(filter: Filter): void {
    const i = this.chain.findIndex((e) => e.filter === filter);
    if (i < 0) return;
    this.chain.splice(i, 1);
    this.apply();
  }

  /** Turns an effect on or off without taking it out of its place. */
  setEnabled(filter: Filter, on: boolean): void {
    const e = this.chain.find((x) => x.filter === filter);
    if (!e || e.on === on) return;
    e.on = on;
    this.apply();
  }

  isEnabled(filter: Filter): boolean {
    return this.chain.find((x) => x.filter === filter)?.on ?? false;
  }

  /** Every effect in the chain, in order. */
  get filters(): readonly Filter[] {
    return this.chain.map((e) => e.filter);
  }

  /** Animates any number (a uniform, an effect's property) from `from` to `to` over `ms`. */
  animate(set: (v: number) => void, from: number, to: number, ms: number, ease?: EaseFn | string, done?: () => void): void {
    this.animator.run({ set, from, to, ms, ease: typeof ease === 'string' ? easeByName(ease) : ease, done });
  }

  /** The whole picture washed towards a colour, fading out over `ms`. Skipped under reduced effects. */
  flash(options: FlashOptions = {}): void {
    if (this.reduced) return;
    const fx = this.ensureColor();
    fx.flashColor = options.color ?? 0xffffff;
    this.animator.run({ key: 'flash', set: (v) => (fx.flash = v), from: options.strength ?? 0.6, to: 0, ms: options.ms ?? 160, ease: easeByName('Quad.Out') });
  }

  /** A ring of bent picture spreading from a screen point (screen pixels). Skipped under reduced effects. */
  shockwave(x: number, y: number, options: ShockwaveRun = {}): void {
    if (this.reduced) return;
    const wave = new ShockwaveFilter(options);
    wave.setCenter((x - this.screen.x) / this.screen.width, (y - this.screen.y) / this.screen.height);
    const amplitude = wave.amplitude;
    this.transient.push(wave);
    this.apply();
    this.animator.run({
      set: (t) => {
        wave.radius = t * (options.reach ?? 0.6);
        wave.amplitude = amplitude * (1 - t);
      },
      from: 0,
      to: 1,
      ms: options.ms ?? 600,
      ease: easeByName('Quad.Out'),
      done: () => {
        this.transient = this.transient.filter((f) => f !== wave);
        this.apply();
        wave.destroy();
      },
    });
  }

  /** The colour adjustment `flash` uses, made and put first in the chain the first time: brightness, saturation, a tint. */
  get color(): ColorAdjustFilter {
    return this.ensureColor();
  }

  /** Steps the animations; `forEngine` calls it on every frame. */
  update(ms: number): void {
    if (this.animator.size > 0) this.animator.step(ms);
    this.fitArea();
  }

  destroy(): void {
    this.offFrame?.();
    this.offFrame = null;
    this.animator.finishAll();
    this.target.filters = [];
    for (const e of this.chain) e.filter.destroy();
    this.chain.length = 0;
    this.backdropSprite?.destroy();
    this.backdropSprite = null;
  }

  /** The screen rectangle mapped into the target's local space (a camera's layer is scaled and moved). */
  private fitArea(): void {
    const m = this.target.worldTransform;
    const det = m.a * m.d - m.b * m.c;
    if (det === 0) return;
    const inv = (x: number, y: number): [number, number] => {
      const dx = x - m.tx;
      const dy = y - m.ty;
      return [(m.d * dx - m.c * dy) / det, (m.a * dy - m.b * dx) / det];
    };
    const [x0, y0] = inv(this.screen.x, this.screen.y);
    const [x1, y1] = inv(this.screen.x + this.screen.width, this.screen.y + this.screen.height);
    this.area.x = Math.min(x0, x1);
    this.area.y = Math.min(y0, y1);
    this.area.width = Math.abs(x1 - x0);
    this.area.height = Math.abs(y1 - y0);
  }

  private get reduced(): boolean {
    return (this.options.honourReducedFx ?? true) && engineSettings.getState().reducedFx;
  }

  private ensureColor(): ColorAdjustFilter {
    if (!this.colorFx) this.colorFx = this.add(new ColorAdjustFilter(), 0);
    return this.colorFx;
  }

  private setBackdrop(color: number): void {
    const s = new Sprite(Texture.WHITE);
    s.tint = color;
    s.label = 'postfx-backdrop';
    this.backdropSprite = s;
    this.target.addChildAt(s, 0);
    const fit = () => {
      s.position.set(this.screen.x, this.screen.y);
      s.width = this.screen.width;
      s.height = this.screen.height;
    };
    fit();
    s.onRender = fit;
  }

  private apply(): void {
    const list: Filter[] = [];
    for (const e of this.chain) if (e.on) list.push(e.filter);
    // transient waves go under the lasting effects, so a CRT's curve bends the wave too
    this.target.filters = list.length + this.transient.length > 0 ? [...this.transient, ...list] : [];
  }
}
