import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Rect, Size } from '../ui/layout/geometry';
import { placeTooltip, type TipSide } from '../ui/layout/placeTooltip';
import { cursorTip } from './placement';
import { useUi, useCx } from './UiProvider';

export interface TooltipProps {
  /** By the cursor: its screen position. */
  x?: number;
  y?: number;
  /** Or beside an element: its screen rect (`getBoundingClientRect()`). Wins over `x`/`y`. */
  anchor?: Rect;
  /** Open over the cursor (or on this side of the anchor) first; it flips when there is no room. */
  above?: boolean;
  side?: TipSide;
  className?: string;
  children: ReactNode;
}

/**
 * A tooltip frame kept on screen by its own measured size (`placeTooltip`): under the cursor while it fits, over it
 * when it does not, slid along the edge, never taller than the viewport. Portalled to the `UiProvider`'s `portal`, so
 * a window's `overflow` or transform never clips or shifts it.
 */
export function Tooltip({ x = 0, y = 0, anchor, above, side, className, children }: TooltipProps) {
  const cx = useCx();
  const ui = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && (el.offsetWidth !== size.width || el.offsetHeight !== size.height)) setSize({ width: el.offsetWidth, height: el.offsetHeight });
  });
  const view = ui.viewport();
  const at = anchor
    ? placeTooltip(anchor, size, view, { side: side ?? (above ? 'above' : 'below'), margin: ui.margin, snap: ui.snap })
    : cursorTip(x, y, size, view, { above: above ?? side === 'above', margin: ui.margin, snap: ui.snap });
  const target = ui.portal();
  const measured = size.width > 0;
  const tip = (
    <div
      ref={ref}
      className={cx(`e1681-tooltip e1681-tip-frame${className ? ` ${className}` : ''}`)}
      role="tooltip"
      style={{ left: at.x, top: at.y, maxHeight: Math.max(0, view.height - 2 * ui.margin), visibility: measured ? undefined : 'hidden' }}
    >
      {children}
    </div>
  );
  return target ? createPortal(tip, target) : tip;
}
