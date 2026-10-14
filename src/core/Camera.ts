import type { Container } from 'pixi.js';
import { Rectangle } from './Rectangle';

export interface TrackOptions {
  /**
   * How much of the way to the target the camera closes each 60th of a second (0–1, default 1: locked on). 0.1 is a
   * soft follow; the rate is the same at any frame rate.
   */
  lerp?: number;
  /** A box round the screen's centre (world px) the target may move in without the camera moving. */
  deadzoneWidth?: number;
  deadzoneHeight?: number;
  /** Where on the target to look (world px from its position), e.g. a little above a body's feet. */
  offsetX?: number;
  offsetY?: number;
}

export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

/**
 * Moves and zooms the world layer. `scrollX/scrollY` is the world point at the top-left of the screen, so
 * `round(scroll * zoom) / zoom` snaps the view to whole screen pixels.
 */
export class Camera {
  zoom = 1;
  /** The zoom `reset` goes back to: the engine sets it from its `zoom` option (default 1). */
  defaultZoom = 1;
  /** Backing pixels per screen pixel (the renderer's resolution, `zoomResolution(zoom, devicePixelRatio)`): what `snap` rounds to. */
  resolution = 1;
  /** Lands the view on whole backing pixels (pixel art); off, the world moves smoothly between them. */
  roundPixels = false;
  scrollX = 0;
  scrollY = 0;
  width = 0;
  height = 0;
  private bounds: { x: number; y: number; width: number; height: number } | null = null;
  private shakeUntil = 0;
  private shakeMs = 1;
  private shakeAngle: number | undefined = undefined;
  private shakeIntensity = 0;
  private flashRect: Rectangle | null = null;
  private flashStart = 0;
  private flashMs = 1;
  private flashPeak = 1;
  /** Screen-layer containers laid over the world with its exact transform, shake included (see `follow`). */
  private readonly followers = new Set<Container>();
  private target: { readonly x: number; readonly y: number } | null = null;
  private trackOpts: Required<TrackOptions> = { lerp: 1, deadzoneWidth: 0, deadzoneHeight: 0, offsetX: 0, offsetY: 0 };
  private lastApply = -1;

  constructor(
    private readonly world: Container,
    private readonly screen: Container,
  ) {}

  get worldView(): ViewRect {
    const width = this.width / this.zoom;
    const height = this.height / this.zoom;
    return { x: this.scrollX, y: this.scrollY, width, height, right: this.scrollX + width, bottom: this.scrollY + height };
  }

  setZoom(z: number): this {
    this.zoom = z;
    return this;
  }

  /** A world coordinate snapped to the nearest backing pixel: one screen pixel, or a half at ×1.5. */
  snap(v: number): number {
    const k = this.zoom * this.resolution;
    return Math.round(v * k) / k;
  }

  setBounds(x: number, y: number, width: number, height: number): this {
    this.bounds = { x, y, width, height };
    return this;
  }

  /** Lets the view go anywhere again. */
  clearBounds(): this {
    this.bounds = null;
    return this;
  }

  /**
   * Back to how the engine made it: no target, no bounds, `defaultZoom`, scrolled to 0, no shake or flash. The camera
   * is the engine's, shared by every scene, so a level's target and bounds would otherwise hold over the next scene
   * (a title screen kept following a hero that no longer existed). `SceneManager.replace` calls it between the old
   * scenes leaving and the new one entering; `push` and `pop` leave the camera alone, since the scene under a pause
   * menu still wants its view when it comes back. Layers added with `follow` are kept: they belong to tools that
   * outlive scenes (a debug overlay), not to a scene.
   */
  reset(): this {
    this.target = null;
    this.bounds = null;
    this.zoom = this.defaultZoom;
    this.scrollX = 0;
    this.scrollY = 0;
    this.shakeUntil = 0;
    this.shakeIntensity = 0;
    if (this.flashRect && !this.flashRect.destroyed) this.flashRect.setVisible(false);
    return this;
  }

  /** The tracked target, if any. */
  get tracking(): { readonly x: number; readonly y: number } | null {
    return this.target;
  }

  /** The bounds the view is kept inside, if any. */
  get boundsRect(): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null {
    return this.bounds;
  }

  centerOn(x: number, y: number): this {
    this.scrollX = x - this.width / this.zoom / 2;
    this.scrollY = y - this.height / this.zoom / 2;
    this.clamp();
    return this;
  }

  setScroll(x: number, y: number): this {
    this.scrollX = x;
    this.scrollY = y;
    this.clamp();
    return this;
  }

  /**
   * Screen shake: `intensity` is a fraction of the screen size, like before. With an `angle` (the way a blow travelled)
   * the shake runs back and forth along it instead of at random, so a hit is felt coming from somewhere.
   */
  shake(ms: number, intensity: number, angle?: number): void {
    const now = performance.now();
    if (now < this.shakeUntil && intensity < this.shakeIntensity) return;
    this.shakeUntil = now + ms;
    this.shakeMs = ms;
    this.shakeIntensity = intensity;
    this.shakeAngle = angle;
  }

  /**
   * Keeps a container on the screen layer placed exactly over the world layer — zoom, scroll and this frame's
   * shake — for things drawn in world units above the screen-layer night (fireflies). Written in `apply`, after
   * the scene updated, so it never lags the world by a frame or misses a shake the world takes.
   */
  follow(layer: Container): void {
    this.followers.add(layer);
  }

  unfollow(layer: Container): void {
    this.followers.delete(layer);
  }

  /** Full-screen colour flash starting at `peak` alpha and fading out over `ms`. */
  flash(ms: number, r: number, g: number, b: number, _force = false, peak = 1): void {
    if (!this.flashRect || this.flashRect.destroyed) {
      this.flashRect = new Rectangle(1, 1, 0xffffff).setOrigin(0, 0);
      this.screen.addChild(this.flashRect);
    }
    this.flashRect.resize(this.width, this.height).setFillStyle((r << 16) | (g << 8) | b).setAlpha(peak).setVisible(true);
    this.flashStart = performance.now();
    this.flashMs = ms;
    this.flashPeak = peak;
  }

  /**
   * Keeps `target` (anything with `x` and `y`, read every frame: an entity's position, a sprite) in view, inside the
   * bounds if there are any. Replaces any target before.
   */
  track(target: { readonly x: number; readonly y: number }, options: TrackOptions = {}): this {
    this.target = target;
    this.trackOpts = { lerp: 1, deadzoneWidth: 0, deadzoneHeight: 0, offsetX: 0, offsetY: 0, ...options };
    if ((options.lerp ?? 1) >= 1) this.centerOn(target.x + this.trackOpts.offsetX, target.y + this.trackOpts.offsetY);
    return this;
  }

  untrack(): this {
    this.target = null;
    return this;
  }

  /** Moves the view toward the tracked target for a frame `dtMs` long. */
  private follow1(dtMs: number): void {
    const t = this.target;
    if (!t) return;
    const o = this.trackOpts;
    const vw = this.width / this.zoom;
    const vh = this.height / this.zoom;
    const cx = this.scrollX + vw / 2;
    const cy = this.scrollY + vh / 2;
    const tx = t.x + o.offsetX;
    const ty = t.y + o.offsetY;
    // only the part of the target's offset outside the deadzone moves the camera
    const hx = o.deadzoneWidth / 2;
    const hy = o.deadzoneHeight / 2;
    const dx = tx - cx > hx ? tx - cx - hx : tx - cx < -hx ? tx - cx + hx : 0;
    const dy = ty - cy > hy ? ty - cy - hy : ty - cy < -hy ? ty - cy + hy : 0;
    const k = o.lerp >= 1 ? 1 : 1 - Math.pow(1 - Math.max(0, o.lerp), dtMs / (1000 / 60));
    this.scrollX += dx * k;
    this.scrollY += dy * k;
    this.clamp();
  }

  /** Writes the camera into the world layer; called once per frame after the scene updated. */
  apply(now: number): void {
    const dtMs = this.lastApply < 0 ? 1000 / 60 : Math.min(100, now - this.lastApply);
    this.lastApply = now;
    this.follow1(dtMs);
    let ox = 0;
    let oy = 0;
    if (now < this.shakeUntil) {
      const k = (this.shakeUntil - now) / this.shakeMs;
      if (this.shakeAngle !== undefined) {
        // along the blow: thrown the way it went, then rocking back, a little less each beat
        const swing = Math.cos(((now - (this.shakeUntil - this.shakeMs)) / 28) * Math.PI) * this.shakeIntensity * this.width * k;
        ox = Math.round(Math.cos(this.shakeAngle) * swing);
        oy = Math.round(Math.sin(this.shakeAngle) * swing);
      } else {
        ox = Math.round((Math.random() * 2 - 1) * this.shakeIntensity * this.width * k);
        oy = Math.round((Math.random() * 2 - 1) * this.shakeIntensity * this.height * k);
      }
    }
    this.world.scale.set(this.zoom);
    const k = this.zoom * this.resolution;
    const sx = this.roundPixels ? Math.round(this.scrollX * k) / this.resolution : this.scrollX * this.zoom;
    const sy = this.roundPixels ? Math.round(this.scrollY * k) / this.resolution : this.scrollY * this.zoom;
    this.world.position.set(-sx + ox, -sy + oy);
    for (const f of this.followers) {
      f.scale.set(this.zoom);
      f.position.copyFrom(this.world.position);
    }
    if (this.flashRect?.visible) {
      const t = (now - this.flashStart) / this.flashMs;
      if (t >= 1) this.flashRect.setVisible(false);
      else this.flashRect.alpha = this.flashPeak * (1 - t);
    }
  }

  private clamp(): void {
    const b = this.bounds;
    if (!b) return;
    const vw = this.width / this.zoom;
    const vh = this.height / this.zoom;
    this.scrollX = vw >= b.width ? b.x + (b.width - vw) / 2 : Math.min(Math.max(this.scrollX, b.x), b.x + b.width - vw);
    this.scrollY = vh >= b.height ? b.y + (b.height - vh) / 2 : Math.min(Math.max(this.scrollY, b.y), b.y + b.height - vh);
  }
}
