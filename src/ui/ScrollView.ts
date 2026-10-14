import { Container, Graphics, Rectangle, Sprite, Texture, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';
import { clampScroll, maxScroll, scrollIntoView, stepFling } from './layout/scroll';
import type { UiTicking } from './UiHost';
import { Widget } from './Widget';

export interface ScrollViewOptions {
  width: number;
  height: number;
  /** Pixels a wheel notch scrolls at most (default 48). */
  wheelStep?: number;
  /** How far a press must move before it is a drag instead of a tap (default 6 px). */
  dragSlop?: number;
  /** The scroll bar's colour; null hides it (default white at 0.4 alpha). */
  barColor?: number | null;
  barWidth?: number;
}

/**
 * A vertical scroll view: `content` is clipped to the box and scrolled by the wheel, by dragging (with a fling) and
 * to whatever the keyboard focuses. A press that turned into a drag is not a tap on the button under it.
 */
export class ScrollView extends Widget implements UiTicking {
  readonly content = new Container();
  /** True from the moment a press became a drag until the next press: buttons inside ignore that tap. */
  suppressesTaps = false;
  private readonly clip = new Graphics();
  private readonly bar: Sprite | null;
  private offset = 0;
  private contentH = 0;
  private velocity = 0;
  private ticking = false;
  private clipW = -1;
  private clipH = -1;
  private dragFrom = 0;
  private dragOffset = 0;
  private lastY = 0;
  private lastT = 0;
  private readonly onMove = (e: FederatedPointerEvent) => this.dragMove(e);
  private readonly onUp = () => this.dragEnd();

  constructor(private readonly options: ScrollViewOptions) {
    super();
    this.addChild(this.content, this.clip);
    this.content.mask = this.clip;
    const color = options.barColor === undefined ? 0xffffff : options.barColor;
    this.bar = color === null ? null : new Sprite(Texture.WHITE);
    if (this.bar) {
      this.bar.tint = color as number;
      this.bar.alpha = 0.4;
      this.addChild(this.bar);
    }
    this.makeInteractive();
    this.hitArea = new Rectangle(0, 0, 0, 0);
    this.on('wheel', (e: FederatedWheelEvent) => {
      const step = options.wheelStep ?? 48;
      const dy = Math.max(-step, Math.min(step, e.deltaY));
      if (this.scrollTo(this.offset + dy)) e.stopPropagation();
    });
    this.on('pointerdown', (e) => this.dragStart(e));
    this.resize(options.width, options.height);
  }

  get scrollY(): number {
    return this.offset;
  }

  get contentHeight(): number {
    return this.contentH;
  }

  /** Sets how tall the content is (default: measured from it by `measure`). */
  setContentHeight(h: number): this {
    this.contentH = Math.max(0, h);
    this.scrollTo(this.offset);
    this.redraw();
    return this;
  }

  /** Measures the content's drawn height; call after filling it. */
  measure(): this {
    const b = this.content.getLocalBounds();
    return this.setContentHeight(b.maxY);
  }

  /** Scrolls to `y`, kept in range; true when it moved. */
  scrollTo(y: number): boolean {
    const next = clampScroll(y, this.contentH, this.boxH);
    if (next === this.offset) return false;
    this.offset = next;
    this.redraw();
    return true;
  }

  /** Brings a child into view (the focus manager calls it when a widget inside is focused). */
  reveal(child: Container): void {
    const top = this.content.toLocal(child.getGlobalPosition()).y;
    const h = child instanceof Widget ? child.boxHeight : child.getLocalBounds().maxY;
    this.velocity = 0;
    this.scrollTo(scrollIntoView(this.offset, top, h, this.boxH, this.contentH));
  }

  tick(dtMs: number): boolean {
    if (this.destroyed || this.velocity === 0) return (this.ticking = false);
    const moved = this.scrollTo(this.offset + (this.velocity * dtMs) / 1000);
    this.velocity = moved ? stepFling(this.velocity, dtMs) : 0;
    this.ticking = this.velocity !== 0;
    return this.ticking;
  }

  override destroy(): void {
    this.dragEnd();
    super.destroy({ children: true });
  }

  private dragStart(e: FederatedPointerEvent): void {
    this.suppressesTaps = false;
    this.velocity = 0;
    this.dragFrom = e.global.y;
    this.dragOffset = this.offset;
    this.lastY = e.global.y;
    this.lastT = performance.now();
    this.on('globalpointermove', this.onMove);
    this.on('pointerup', this.onUp);
    this.on('pointerupoutside', this.onUp);
  }

  private dragMove(e: FederatedPointerEvent): void {
    const y = e.global.y;
    if (!this.suppressesTaps && Math.abs(y - this.dragFrom) < (this.options.dragSlop ?? 6)) return;
    this.suppressesTaps = true;
    const now = performance.now();
    const dt = now - this.lastT;
    // the speed of the last move, for the fling when the finger lifts
    if (dt > 0) this.velocity = ((this.lastY - y) / dt) * 1000;
    this.lastY = y;
    this.lastT = now;
    this.scrollTo(this.dragOffset + (this.dragFrom - y));
  }

  private dragEnd(): void {
    this.off('globalpointermove', this.onMove);
    this.off('pointerup', this.onUp);
    this.off('pointerupoutside', this.onUp);
    // a finger held still before lifting does not fling
    if (performance.now() - this.lastT > 80) this.velocity = 0;
    if (this.velocity !== 0 && !this.ticking) {
      const host = this.host;
      if (host) {
        this.ticking = true;
        host.animate(this);
      } else this.velocity = 0;
    }
  }

  protected redraw(): void {
    const w = this.boxW;
    const h = this.boxH;
    // the mask is rebuilt only when the box changes, never on a scroll (a fling redraws every frame)
    if (w !== this.clipW || h !== this.clipH) {
      this.clipW = w;
      this.clipH = h;
      this.clip.clear().rect(0, 0, w, h).fill(0xffffff);
    }
    if (this.hitArea instanceof Rectangle) {
      this.hitArea.width = w;
      this.hitArea.height = h;
    }
    const snap = this.host?.pixelPerfect ?? false;
    this.content.y = snap ? -Math.round(this.offset) : -this.offset;
    if (this.bar) {
      const max = maxScroll(this.contentH, h);
      this.bar.visible = max > 0;
      if (max > 0) {
        const bw = this.options.barWidth ?? 2;
        const bh = Math.max(8, Math.round((h * h) / this.contentH));
        this.bar.setSize(bw, bh);
        this.bar.position.set(w - bw, Math.round((this.offset / max) * (h - bh)));
      }
    }
  }
}
