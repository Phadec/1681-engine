import { clamp, snapPx, type Point, type Rect, type Size } from './geometry';

export type TipSide = 'below' | 'above' | 'right' | 'left';

export interface TooltipOptions {
  /** The side tried first (default 'below'); the opposite one when it does not fit. */
  side?: TipSide;
  /** Between the anchor and the tip (default 4). */
  gap?: number;
  /** Kept clear of the screen's edges (default 4). */
  margin?: number;
  /** Across the side: line up with the anchor's start or centre on it (default 'start'). */
  align?: 'start' | 'center';
  snap?: boolean;
}

export interface TooltipPlacement extends Point {
  /** The side it went on after flipping. */
  side: TipSide;
}

const OPPOSITE: Record<TipSide, TipSide> = { below: 'above', above: 'below', right: 'left', left: 'right' };

/** Room on `side` of the anchor, inside the margins. */
function room(side: TipSide, a: Rect, view: Size, gap: number, margin: number): number {
  switch (side) {
    case 'below':
      return view.height - margin - (a.y + a.height + gap);
    case 'above':
      return a.y - gap - margin;
    case 'right':
      return view.width - margin - (a.x + a.width + gap);
    case 'left':
      return a.x - gap - margin;
  }
}

/**
 * Where a tooltip of `tip` size goes beside `anchor`: on the preferred side when it fits, flipped to the opposite one
 * when it does not, the roomier of the two when neither does; then slid along the edge to stay on screen.
 */
export function placeTooltip(anchor: Rect, tip: Size, viewport: Size, options: TooltipOptions = {}): TooltipPlacement {
  const gap = options.gap ?? 4;
  const margin = options.margin ?? 4;
  const want = options.side ?? 'below';
  const vertical = want === 'below' || want === 'above';
  const need = vertical ? tip.height : tip.width;
  let side = want;
  if (room(want, anchor, viewport, gap, margin) < need) {
    const other = OPPOSITE[want];
    const otherRoom = room(other, anchor, viewport, gap, margin);
    if (otherRoom >= need || otherRoom > room(want, anchor, viewport, gap, margin)) side = other;
  }
  let x: number;
  let y: number;
  if (vertical) {
    y = side === 'below' ? anchor.y + anchor.height + gap : anchor.y - gap - tip.height;
    x = options.align === 'center' ? anchor.x + (anchor.width - tip.width) / 2 : anchor.x;
  } else {
    x = side === 'right' ? anchor.x + anchor.width + gap : anchor.x - gap - tip.width;
    y = options.align === 'center' ? anchor.y + (anchor.height - tip.height) / 2 : anchor.y;
  }
  x = clamp(x, margin, Math.max(margin, viewport.width - margin - tip.width));
  y = clamp(y, margin, Math.max(margin, viewport.height - margin - tip.height));
  return { x: snapPx(x, options.snap ?? false), y: snapPx(y, options.snap ?? false), side };
}
