import { insets, snapPx, type Insets, type Point, type Size } from './geometry';

/** A spot on the screen a HUD piece is pinned to; it stays there whatever the screen's size. */
export type ScreenAnchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

/** Fractions of the free space for each anchor: 0 hugs the left/top edge, 1 the right/bottom, 0.5 centres. */
const FRACTIONS: Record<ScreenAnchor, readonly [number, number]> = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
};

/**
 * Top-left of a box of `size` pinned to `anchor` of the viewport, `margin` in from the edges (a number, or per side
 * for a phone's notch). Centred anchors ignore the margins of the sides they do not touch.
 */
export function anchorPosition(anchor: ScreenAnchor, size: Size, viewport: Size, margin: number | Partial<Insets> = 0, snap = false): Point {
  const m = insets(margin);
  const [fx, fy] = FRACTIONS[anchor];
  const x = fx === 0 ? m.left : fx === 1 ? viewport.width - m.right - size.width : (viewport.width - size.width) / 2;
  const y = fy === 0 ? m.top : fy === 1 ? viewport.height - m.bottom - size.height : (viewport.height - size.height) / 2;
  return { x: snapPx(x, snap), y: snapPx(y, snap) };
}
