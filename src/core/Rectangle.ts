import { Container, Graphics as PixiGraphics } from 'pixi.js';
import { GameObject } from './gameObject';

/** A filled rectangle placed by its origin (centred by default). */
export class Rectangle extends GameObject(Container) {
  private readonly g = new PixiGraphics();
  private ox = 0.5;
  private oy = 0.5;

  constructor(
    private w: number,
    private h: number,
    private color: number,
    private fillAlpha = 1,
  ) {
    super();
    this.addChild(this.g);
    this.redraw();
  }

  get originX(): number {
    return this.ox;
  }

  get originY(): number {
    return this.oy;
  }

  get rectWidth(): number {
    return this.w;
  }

  get rectHeight(): number {
    return this.h;
  }

  get fillColor(): number {
    return this.color;
  }

  get fillOpacity(): number {
    return this.fillAlpha;
  }

  setOrigin(x = 0.5, y = x): this {
    this.ox = x;
    this.oy = y;
    return this.redraw();
  }

  setFillStyle(color: number, alpha = 1): this {
    this.color = color;
    this.fillAlpha = alpha;
    return this.redraw();
  }

  setDisplaySize(w: number, h: number): this {
    return this.setScale(w / this.w, h / this.h);
  }

  resize(w: number, h: number): this {
    this.w = w;
    this.h = h;
    return this.redraw();
  }

  private redraw(): this {
    this.g.clear().rect(-this.w * this.ox, -this.h * this.oy, this.w, this.h).fill({ color: this.color, alpha: this.fillAlpha });
    return this;
  }
}
