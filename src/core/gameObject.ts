import { ColorMatrixFilter, type BLEND_MODES, type Container } from 'pixi.js';
import type { Stage } from './Stage';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor<T> = new (...args: any[]) => T;

/**
 * One solid-fill filter list per colour, shared by every object filled with it (a hit flash, a silhouette): a filter
 * made and destroyed on every hit of every body was garbage and shader state a blow. Kept for good —
 * a handful of colours are ever used.
 */
const FILLS = new Map<number, ColorMatrixFilter[]>();

function fillFilters(color: number): ColorMatrixFilter[] {
  let list = FILLS.get(color);
  if (list) return list;
  const f = new ColorMatrixFilter();
  f.antialias = 'off';
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  f.matrix = [0, 0, 0, 0, r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, 0, 0, 0, 1, 0];
  FILLS.set(color, (list = [f]));
  return list;
}

/** What `GameObject` adds to a Pixi display object. */
export interface GameObjectMembers {
  scene: Stage;
  /** False once destroyed. */
  readonly active: boolean;
  /** The draw order in the world layer (`zIndex`): bigger is in front. */
  depth: number;
  /** Scale without the flip: stays positive on a mirrored sprite. */
  scaleX: number;
  scaleY: number;
  flipX: boolean;
  flipY: boolean;
  setScale(x: number, y?: number): this;
  setFlipX(v: boolean): this;
  setFlipY(v: boolean): this;
  setFlip(x: boolean, y: boolean): this;
  setDepth(d: number): this;
  setAlpha(a?: number): this;
  setVisible(v: boolean): this;
  setPosition(x?: number, y?: number): this;
  setRotation(r?: number): this;
  setAngle(a?: number): this;
  setBlendMode(mode: BLEND_MODES): this;
  setTint(color?: number): this;
  /** Paints every opaque pixel in one solid colour (hit flash, silhouettes). */
  setTintFill(color: number): this;
  clearTint(): this;
  /** 0 pins the object to the screen instead of the world. */
  setScrollFactor(f: number): this;
  destroy(): void;
}

/**
 * The chainable setters the world code was written against (setDepth, setAlpha, setTintFill...), added onto a Pixi
 * display object. Scale is kept apart from flipping, so `scaleX` stays positive on a mirrored sprite as it did
 * before, and a tween on scale cannot undo a flip.
 */
export function GameObject<TBase extends Ctor<Container>>(Base: TBase): TBase & Ctor<GameObjectMembers> {
  return class extends Base {
    scene!: Stage;
    private sx = 1;
    private sy = 1;
    private fx = false;
    private fy = false;
    /** The colour this object is filled with (`setTintFill`), or null. */
    private solidFillColor: number | null = null;

    /** False once destroyed. */
    get active(): boolean {
      return !this.destroyed;
    }

    get depth(): number {
      return this.zIndex;
    }

    set depth(d: number) {
      this.zIndex = d;
    }

    get scaleX(): number {
      return this.sx;
    }

    set scaleX(v: number) {
      this.sx = v;
      this.applyScale();
    }

    get scaleY(): number {
      return this.sy;
    }

    set scaleY(v: number) {
      this.sy = v;
      this.applyScale();
    }

    get flipX(): boolean {
      return this.fx;
    }

    set flipX(v: boolean) {
      this.fx = v;
      this.applyScale();
    }

    get flipY(): boolean {
      return this.fy;
    }

    set flipY(v: boolean) {
      this.fy = v;
      this.applyScale();
    }

    private applyScale(): void {
      if (!this.destroyed) this.scale.set(this.sx * (this.fx ? -1 : 1), this.sy * (this.fy ? -1 : 1));
    }

    setScale(x: number, y = x): this {
      this.sx = x;
      this.sy = y;
      this.applyScale();
      return this;
    }

    setFlipX(v: boolean): this {
      this.flipX = v;
      return this;
    }

    setFlipY(v: boolean): this {
      this.flipY = v;
      return this;
    }

    setFlip(x: boolean, y: boolean): this {
      this.fx = x;
      this.fy = y;
      this.applyScale();
      return this;
    }

    setDepth(d: number): this {
      this.zIndex = d;
      return this;
    }

    setAlpha(a = 1): this {
      this.alpha = a;
      return this;
    }

    setVisible(v: boolean): this {
      this.visible = v;
      return this;
    }

    setPosition(x = 0, y = x): this {
      this.position.set(x, y);
      return this;
    }

    setRotation(r = 0): this {
      this.rotation = r;
      return this;
    }

    setAngle(a = 0): this {
      this.angle = a;
      return this;
    }

    setBlendMode(mode: BLEND_MODES): this {
      this.blendMode = mode;
      return this;
    }

    setTint(color = 0xffffff): this {
      this.clearFill();
      this.tint = color;
      return this;
    }

    /** Paints every opaque pixel in one solid colour (hit flash, silhouettes). */
    setTintFill(color: number): this {
      this.tint = 0xffffff;
      if (this.solidFillColor === color) return this;
      this.solidFillColor = color;
      this.filters = fillFilters(color);
      return this;
    }

    clearTint(): this {
      this.clearFill();
      this.tint = 0xffffff;
      return this;
    }

    private clearFill(): void {
      if (this.solidFillColor === null) return;
      this.filters = null;
      this.solidFillColor = null;
    }

    /** 0 pins the object to the screen instead of the world (full-screen flashes). */
    setScrollFactor(f: number): this {
      if (f === 0) this.scene.screen.addChild(this);
      return this;
    }

    override destroy(): void {
      if (this.destroyed) return;
      // the fill filters are shared (`FILLS`): let go of them, never destroy them
      if (this.solidFillColor !== null) this.filters = null;
      this.solidFillColor = null;
      // `context`: a Pixi Graphics destroyed with options keeps its GraphicsContext — and that context's GPU buffers —
      // until Pixi's own GC sweeps it a minute or more later. Every effect layer is a Graphics, so a crowded fight left
      // hundreds a second on the GPU, and a phone that ran out dropped the WebGL context (the world rebuilt, seconds
      // frozen, the socket timed out).
      super.destroy({ children: true, context: true });
    }
  };
}
