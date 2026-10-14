export interface DomOverlayOptions {
  /** Added to the root element (for the game's CSS). */
  className?: string;
  /** Stacking order over the canvas (default 1). */
  zIndex?: number;
  /**
   * The canvas's size in screen pixels (`() => app.screen`): when CSS stretches the canvas past it (a small fixed
   * canvas scaled up), `cssScale` is how much, and world placement follows it. Default: no stretch.
   */
  logicalSize?: () => { width: number; height: number };
}

/**
 * The element a DOM (or React) UI is mounted in, laid exactly over the canvas and resized with it. It sits beside the
 * canvas in the same parent, so it shares the canvas's positioned ancestor and needs no change to the page's CSS.
 *
 * The root lets presses through (`pointer-events: none`) so the world stays playable between panels; give what the
 * player presses `pointer-events: auto` (`DomOverlay.interactive`). `content` is drawn at `scale` (a whole multiple
 * for pixel-art UI): laid out on a box `1 / scale` the overlay and scaled back up, so a window sized for 320 × 180
 * fills the screen at ×4 with sharp edges.
 */
export class DomOverlay {
  readonly root: HTMLDivElement;
  /** Where the UI goes: scaled by `scale`. */
  readonly content: HTMLDivElement;
  private scaleNow = 1;
  private cssW = 0;
  private cssH = 0;
  private stretch = 1;
  private readonly observer: ResizeObserver | null;
  private readonly onWindow = () => this.sync();

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly options: DomOverlayOptions = {},
  ) {
    const doc = canvas.ownerDocument;
    this.root = doc.createElement('div');
    this.content = doc.createElement('div');
    if (options.className) this.root.className = options.className;
    Object.assign(this.root.style, { position: 'absolute', overflow: 'hidden', pointerEvents: 'none', zIndex: String(options.zIndex ?? 1) });
    Object.assign(this.content.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0', pointerEvents: 'none' });
    this.root.appendChild(this.content);
    canvas.insertAdjacentElement('afterend', this.root);
    // the canvas's box changes on its own (a resizeTo parent, CSS), not only with the window
    this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(this.onWindow) : null;
    this.observer?.observe(canvas);
    window.addEventListener('resize', this.onWindow);
    this.sync();
  }

  /** Lets presses on `el` reach it (the overlay's root and content let them through to the canvas). */
  static interactive(el: HTMLElement): HTMLElement {
    el.style.pointerEvents = 'auto';
    return el;
  }

  /** The overlay's size in CSS pixels (the canvas's box). */
  get width(): number {
    return this.cssW;
  }

  get height(): number {
    return this.cssH;
  }

  /** CSS pixels per screen pixel of the canvas: 1 unless CSS stretches it. */
  get cssScale(): number {
    return this.stretch;
  }

  get scale(): number {
    return this.scaleNow;
  }

  /** Draws `content` at `scale` (also published as the CSS variable `--ui-scale`). */
  setScale(scale: number): void {
    if (scale === this.scaleNow || !(scale > 0)) return;
    this.scaleNow = scale;
    this.applySize();
  }

  /** Lines the overlay up with the canvas again; resizes do it by themselves. */
  sync(): void {
    const c = this.canvas;
    const w = c.clientWidth;
    const h = c.clientHeight;
    const s = this.root.style;
    s.left = `${c.offsetLeft + c.clientLeft}px`;
    s.top = `${c.offsetTop + c.clientTop}px`;
    if (w === this.cssW && h === this.cssH) return;
    this.cssW = w;
    this.cssH = h;
    s.width = `${w}px`;
    s.height = `${h}px`;
    const logical = this.options.logicalSize?.();
    this.stretch = logical && logical.width > 0 ? w / logical.width : 1;
    this.applySize();
  }

  destroy(): void {
    this.observer?.disconnect();
    window.removeEventListener('resize', this.onWindow);
    this.root.remove();
  }

  private applySize(): void {
    const k = this.scaleNow;
    const s = this.content.style;
    s.width = `${this.cssW / k}px`;
    s.height = `${this.cssH / k}px`;
    s.transform = k === 1 ? '' : `scale(${k})`;
    this.root.style.setProperty('--ui-scale', String(k));
  }
}
