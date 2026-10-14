import { Sprite, Texture } from 'pixi.js';
import { drainState, setDrainValue, stepDrain, type DrainOptions, type DrainState } from './layout/barDrain';
import type { UiTicking } from './UiHost';
import { Widget } from './Widget';

export interface BarOptions extends DrainOptions {
  width: number;
  height: number;
  /** The bar itself. */
  color: number;
  /** The trail behind it after a loss (default white at 0.6 alpha). */
  trailColor?: number;
  trailAlpha?: number;
  /** The empty part (default black at half alpha). */
  backColor?: number;
  backAlpha?: number;
  /** Fills upward instead of rightward. */
  vertical?: boolean;
  /** Starting value, 0–1 (default 1). */
  value?: number;
}

/** One white texel stretched and tinted: three sprites a bar, no Graphics rebuilt while it drains. */
function strip(color: number, alpha: number): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.tint = color;
  s.alpha = alpha;
  return s;
}

/** A fraction of a length, on whole pixels when `snap`. */
function part(f: number, full: number, snap: boolean): number {
  return snap ? Math.round(f * full) : f * full;
}

/**
 * A health or progress bar with a delayed drain: a loss shows as a trail that holds a moment, then drains down to
 * the bar, so the player sees how much a hit took. Ticks only while the trail is draining.
 */
export class Bar extends Widget implements UiTicking {
  private readonly state: DrainState;
  private readonly back: Sprite;
  private readonly trail: Sprite;
  private readonly fill: Sprite;
  private ticking = false;

  constructor(private readonly options: BarOptions) {
    super();
    this.state = drainState(options.value ?? 1);
    this.back = strip(options.backColor ?? 0x000000, options.backAlpha ?? 0.5);
    this.trail = strip(options.trailColor ?? 0xffffff, options.trailAlpha ?? 0.6);
    this.fill = strip(options.color, 1);
    this.addChild(this.back, this.trail, this.fill);
    this.resize(options.width, options.height);
  }

  get value(): number {
    return this.state.value;
  }

  /** The trail's length (what was held before the last losses), 0–1. */
  get trailValue(): number {
    return this.state.trail;
  }

  /** Sets the bar, 0–1; `instant` drops the trail with it (a respawn, a new target). */
  setValue(value: number, instant = false): this {
    if (value === this.state.value && !instant) return this;
    setDrainValue(this.state, value, this.options);
    if (instant) this.state.trail = this.state.value;
    this.redraw();
    if (this.state.trail > this.state.value && !this.ticking) {
      const host = this.host;
      if (host) {
        this.ticking = true;
        host.animate(this);
      }
    }
    return this;
  }

  /** Advances the drain; a bar under a `UiRoot` is ticked for you, one standing alone is ticked by the game. */
  tick(dtMs: number): boolean {
    if (this.destroyed) return (this.ticking = false);
    stepDrain(this.state, dtMs, this.options);
    this.redraw();
    this.ticking = this.state.trail > this.state.value;
    return this.ticking;
  }

  protected redraw(): void {
    const w = this.boxW;
    const h = this.boxH;
    const snap = this.host?.pixelPerfect ?? false;
    this.back.setSize(w, h);
    if (this.options.vertical) {
      const t = part(this.state.trail, h, snap);
      const v = part(this.state.value, h, snap);
      this.trail.setSize(w, t);
      this.trail.position.set(0, h - t);
      this.fill.setSize(w, v);
      this.fill.position.set(0, h - v);
    } else {
      this.trail.setSize(part(this.state.trail, w, snap), h);
      this.fill.setSize(part(this.state.value, w, snap), h);
    }
    this.alpha = this.enabled ? 1 : 0.5;
  }
}
