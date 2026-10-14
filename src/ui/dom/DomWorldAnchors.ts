import { UPDATE_PRIORITY, type Ticker } from 'pixi.js';
import type { DomOverlay } from './DomOverlay';
import { onScreen, worldToScreen, type LayerTransform } from './worldToScreen';

export interface WorldAnchorOptions {
  /** Moved this far after projecting (CSS px): a name 20 px over the feet. */
  offsetX?: number;
  offsetY?: number;
  /**
   * Which point of the element sits on the spot, as fractions of its size (default 0.5, 1: centred above it).
   * Written as a CSS translate in percent, so the element is never measured.
   */
  alignX?: number;
  alignY?: number;
  /** Kept shown this far past the screen's edge (default 64 px), so a wide label does not pop out early. */
  margin?: number;
}

/** Anything with a world position read every frame: an entity's position object, a sprite. */
export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

interface Anchor {
  el: HTMLElement;
  target: WorldPoint;
  ox: number;
  oy: number;
  align: string;
  margin: number;
  lastX: number;
  lastY: number;
  shown: boolean;
}

const point = { x: 0, y: 0 };

/**
 * DOM elements that follow points in the world (names over heads, speech bubbles, markers): placed every frame
 * through the world layer's own transform, on whole CSS pixels, and hidden off screen. A style is written only when
 * the rounded position or visibility changed, so a still crowd costs no DOM writes.
 */
export class DomWorldAnchors {
  private readonly anchors: Anchor[] = [];
  private ticker: Ticker | null = null;
  private readonly onTick = () => this.update();

  constructor(
    private readonly overlay: DomOverlay,
    /** The layer the points are in: `engine.stage.world`. */
    private readonly layer: LayerTransform,
  ) {}

  /** Places `el` (put inside the overlay's content if it is not already there) on `target`. Returns the remover. */
  add(el: HTMLElement, target: WorldPoint, options: WorldAnchorOptions = {}): () => void {
    if (!el.parentElement) this.overlay.content.appendChild(el);
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    const ax = (options.alignX ?? 0.5) * 100;
    const ay = (options.alignY ?? 1) * 100;
    const a: Anchor = {
      el,
      target,
      ox: options.offsetX ?? 0,
      oy: options.offsetY ?? 0,
      align: ax === 0 && ay === 0 ? '' : ` translate(${-ax}%, ${-ay}%)`,
      margin: options.margin ?? 64,
      lastX: NaN,
      lastY: NaN,
      shown: true,
    };
    this.anchors.push(a);
    return () => this.remove(el);
  }

  remove(el: HTMLElement): void {
    const i = this.anchors.findIndex((a) => a.el === el);
    if (i >= 0) this.anchors.splice(i, 1);
  }

  /**
   * Runs `update` on `ticker` after Pixi renders (`UTILITY` priority), so it reads the camera as this frame drew it,
   * shake included. The returned function stops it.
   */
  attach(ticker: Ticker): () => void {
    this.detach();
    this.ticker = ticker;
    ticker.add(this.onTick, undefined, UPDATE_PRIORITY.UTILITY);
    return () => this.detach();
  }

  detach(): void {
    this.ticker?.remove(this.onTick);
    this.ticker = null;
  }

  /** Places every element for this frame. */
  update(): void {
    // the overlay's content is scaled: positions are written in its own units
    const k = this.overlay.cssScale / this.overlay.scale;
    const w = this.overlay.width / this.overlay.scale;
    const h = this.overlay.height / this.overlay.scale;
    for (const a of this.anchors) {
      worldToScreen(this.layer, a.target.x, a.target.y, point, k);
      const x = Math.round(point.x + a.ox);
      const y = Math.round(point.y + a.oy);
      const show = onScreen(x, y, w, h, a.margin);
      if (show !== a.shown) {
        a.shown = show;
        a.el.style.display = show ? '' : 'none';
      }
      if (!show || (x === a.lastX && y === a.lastY)) continue;
      a.lastX = x;
      a.lastY = y;
      a.el.style.transform = `translate3d(${x}px, ${y}px, 0)${a.align}`;
    }
  }

  destroy(): void {
    this.detach();
    this.anchors.length = 0;
  }
}
