import { clamp, snapPx, type Rect, type Size } from './geometry';

export interface FitOptions {
  /** Kept clear between the window and the screen's edges (default 8). */
  margin?: number;
  /**
   * The scale the window is meant to be drawn at (default 1): a player's "window size" setting, or a whole multiple
   * for pixel art. The window is laid out on a box `1 / scale` the screen and drawn back at `scale`.
   */
  scale?: number;
  /**
   * The smallest scale it may shrink to before it starts scrolling instead (default: `scale`, never shrinks). A
   * pixel-art game keeps it at its whole scale: a fractional one smears every texel.
   */
  minScale?: number;
  /** Centre it on the screen instead of keeping `rect.x/y` (default false). */
  centre?: boolean;
  snap?: boolean;
}

export interface FitResult extends Rect {
  /** The scale to draw the window at; `x`, `y` are screen pixels, `width`, `height` the window's own units. */
  scale: number;
  /** The window was cut shorter (narrower) than it wanted: its body must scroll. */
  scrollY: boolean;
  scrollX: boolean;
}

/**
 * Fits a window into the screen so it never overflows it: shrunk down to `minScale` if that is allowed, then cut to
 * what is left (the caller scrolls its body), and moved back inside the edges. `rect` is where and how big the
 * window wants to be, in its own units; `x`, `y` are screen pixels.
 */
export function fitToViewport(rect: Rect | Size, viewport: Size, options: FitOptions = {}): FitResult {
  const margin = options.margin ?? 8;
  const preferred = options.scale ?? 1;
  const minScale = Math.min(options.minScale ?? preferred, preferred);
  const snap = options.snap ?? false;
  const availW = Math.max(0, viewport.width - 2 * margin);
  const availH = Math.max(0, viewport.height - 2 * margin);
  const fits = rect.width > 0 && rect.height > 0 ? Math.min(availW / rect.width, availH / rect.height) : preferred;
  const scale = clamp(fits, minScale, preferred);
  // what still does not fit at that scale is cut, and the body scrolls
  const width = Math.min(rect.width, availW / scale);
  const height = Math.min(rect.height, availH / scale);
  const drawnW = width * scale;
  const drawnH = height * scale;
  const wantX = options.centre || !('x' in rect) ? (viewport.width - drawnW) / 2 : rect.x;
  const wantY = options.centre || !('y' in rect) ? (viewport.height - drawnH) / 2 : rect.y;
  const x = clamp(wantX, margin, Math.max(margin, viewport.width - margin - drawnW));
  const y = clamp(wantY, margin, Math.max(margin, viewport.height - margin - drawnH));
  return {
    x: snapPx(x, snap),
    y: snapPx(y, snap),
    width: snap ? Math.floor(width) : width,
    height: snap ? Math.floor(height) : height,
    scale,
    scrollX: width < rect.width,
    scrollY: height < rect.height,
  };
}
