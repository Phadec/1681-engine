import { Container, Graphics as PixiGraphics } from 'pixi.js';
import { GameObject } from './gameObject';

interface Vec2 {
  x: number;
  y: number;
}

/**
 * Immediate-mode vector drawing with a current fill and line style (fillStyle + fillRect), on top of Pixi's
 * shape-then-fill Graphics. Wrapped rather than subclassed: Pixi's Graphics owns `fillStyle` as a property.
 */
export class Graphics extends GameObject(Container) {
  private readonly g = new PixiGraphics();
  private fill = { color: 0xffffff, alpha: 1 };
  private line = { width: 1, color: 0xffffff, alpha: 1 };

  constructor() {
    super();
    this.addChild(this.g);
  }

  fillStyle(color: number, alpha = 1): this {
    this.fill = { color, alpha };
    return this;
  }

  lineStyle(width: number, color: number, alpha = 1): this {
    this.line = { width, color, alpha };
    return this;
  }

  clear(): this {
    this.g.clear();
    return this;
  }

  fillRect(x: number, y: number, w: number, h: number): this {
    this.g.rect(x, y, w, h).fill(this.fill);
    return this;
  }

  fillEllipse(x: number, y: number, w: number, h: number): this {
    this.g.ellipse(x, y, w / 2, h / 2).fill(this.fill);
    return this;
  }

  strokeEllipse(x: number, y: number, w: number, h: number): this {
    this.g.ellipse(x, y, w / 2, h / 2).stroke(this.line);
    return this;
  }

  fillCircle(x: number, y: number, r: number): this {
    this.g.circle(x, y, r).fill(this.fill);
    return this;
  }

  strokeCircle(x: number, y: number, r: number): this {
    this.g.circle(x, y, r).stroke(this.line);
    return this;
  }

  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    this.g.moveTo(x1, y1).lineTo(x2, y2).stroke(this.line);
    return this;
  }

  fillPoints(points: Vec2[], _closeShape = true): this {
    this.g.poly(points.flatMap((p) => [p.x, p.y]), true).fill(this.fill);
    return this;
  }

  strokePoints(points: Vec2[], closeShape = false): this {
    this.g.poly(points.flatMap((p) => [p.x, p.y]), closeShape).stroke(this.line);
    return this;
  }

  /** A pie slice from the centre, for cone telegraphs. */
  slice(x: number, y: number, r: number, start: number, end: number, anticlockwise = false): this {
    this.g.moveTo(x, y).arc(x, y, r, start, end, anticlockwise).closePath();
    return this;
  }

  beginPath(): this {
    this.g.beginPath();
    return this;
  }

  moveTo(x: number, y: number): this {
    this.g.moveTo(x, y);
    return this;
  }

  lineTo(x: number, y: number): this {
    this.g.lineTo(x, y);
    return this;
  }

  closePath(): this {
    this.g.closePath();
    return this;
  }

  fillPath(): this {
    this.g.fill(this.fill);
    return this;
  }

  strokePath(): this {
    this.g.stroke(this.line);
    return this;
  }
}
