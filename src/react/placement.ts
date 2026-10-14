/**
 * The kit's layout decisions as pure functions over the engine's layout maths (`src/ui/layout`), so they run and are
 * tested under node: the components only measure the DOM and apply what these return.
 */
import type { CSSProperties } from 'react';
import { fitToViewport, type FitOptions, type FitResult } from '../ui/layout/fitToViewport';
import type { Rect, Size } from '../ui/layout/geometry';
import { placeTooltip, type TooltipPlacement } from '../ui/layout/placeTooltip';

/**
 * Where a window or dialog of `wanted` size stands: fitted into the viewport by `fitToViewport` (shrunk to its
 * `minScale`, then cut, then moved inside the edges), centred unless `wanted` has an `x`/`y`. The style places it in
 * whole pixels with `left`/`top`, never `translate(-50%)`, and caps its size so its body scrolls.
 */
export function windowStyle(wanted: Rect | Size, viewport: Size, options: FitOptions = {}): { fit: FitResult; style: CSSProperties } {
  const fit = fitToViewport(wanted, viewport, { snap: true, ...options, centre: options.centre ?? !('x' in wanted) });
  const style: CSSProperties = {
    left: fit.x,
    top: fit.y,
    maxWidth: fit.width,
    maxHeight: fit.height,
    transform: fit.scale === 1 ? undefined : `scale(${fit.scale})`,
    transformOrigin: fit.scale === 1 ? undefined : '0 0',
  };
  return { fit, style };
}

/**
 * A touch sheet at a player's "window size": laid out on a box `1 / scale` the screen and scaled back down to fill
 * it, so a smaller window shows more rows and still covers the screen. Nothing at 1.
 */
export function sheetScaleStyle(scale: number): CSSProperties | undefined {
  if (scale === 1 || !(scale > 0)) return undefined;
  return { width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: '0 0' };
}

export interface CursorTipOptions {
  /** Open over the cursor first (a bar pinned to the bottom edge), not under it. */
  above?: boolean;
  /** Between the cursor and the tip, up and down (default 12). */
  gap?: number;
  /** How far right of the cursor the tip starts, so the pointer never covers it (default 18). */
  offsetX?: number;
  margin?: number;
  snap?: boolean;
}

/** A tooltip of `tip` size by the cursor: under it while it fits, over it when not, slid to stay on screen. */
export function cursorTip(x: number, y: number, tip: Size, viewport: Size, options: CursorTipOptions = {}): TooltipPlacement {
  const anchor = { x: x + (options.offsetX ?? 18), y, width: 0, height: 0 };
  return placeTooltip(anchor, tip, viewport, {
    side: options.above ? 'above' : 'below',
    gap: options.gap ?? 12,
    margin: options.margin ?? 8,
    snap: options.snap ?? true,
  });
}

export interface ListPlacement {
  x: number;
  y: number;
  /** The list's height: its own, or the room on its side when that is less (it scrolls). */
  height: number;
  side: 'below' | 'above';
}

/**
 * A drop-down list under its button (`anchor`), over it when the room below is short and there is more above; as
 * tall as it is or as the room on that side allows. `list.width` is already the measured `listWidth`.
 */
export function listPlacement(anchor: Rect, list: Size, viewport: Size, gap = 2, margin = 4): ListPlacement {
  const below = viewport.height - margin - (anchor.y + anchor.height + gap);
  const above = anchor.y - gap - margin;
  const height = Math.max(0, Math.min(list.height, Math.max(below, above)));
  const p = placeTooltip(anchor, { width: list.width, height }, viewport, { side: 'below', gap, margin, snap: true });
  return { x: p.x, y: p.y, height: Math.floor(height), side: p.side === 'above' ? 'above' : 'below' };
}

/**
 * A sprite of `w` × `h` art pixels at the largest **whole** multiple that fits the box (never past `maxScale`), or a
 * whole divisor when it is bigger than the box: `object-fit: contain` stretched a 26-px sprite by 2.77 and drew its
 * pixels two and three screen pixels wide by turns.
 */
export function pixelFit(w: number, h: number, boxW: number, boxH: number, maxScale = Infinity): Size & { scale: number } {
  if (!(w > 0) || !(h > 0)) return { width: 0, height: 0, scale: 1 };
  const k = Math.min(boxW / w, boxH / h, maxScale);
  const scale = k >= 1 ? Math.floor(k) : 1 / Math.ceil(1 / k);
  return { width: Math.round(w * scale), height: Math.round(h * scale), scale };
}

/** Below this width (CSS px) a touch screen shows one pane of a `SplitPane` at a time. */
export const SPLIT_STACK_BELOW = 600;

/** Side by side, or one pane at a time: only a touch screen narrower than `stackBelow` stacks. */
export function splitModeFor(width: number, touch: boolean, stackBelow = SPLIT_STACK_BELOW): 'side' | 'stack' {
  return touch && width < stackBelow ? 'stack' : 'side';
}
