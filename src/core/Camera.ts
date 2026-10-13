import type { Container } from 'pixi.js';
import { Rectangle } from './Rectangle';

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
  /** Backing pixels per screen pixel (the renderer's resolution, `zoomResolution`): what `snap` rounds to. */
  resolution = 1;
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

  /** Writes the camera into the world layer; called once per frame after the scene updated. */
  apply(now: number): void {
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
    this.world.position.set(-this.scrollX * this.zoom + ox, -this.scrollY * this.zoom + oy);
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
