import { insets, snapPx, type Insets, type Rect, type Size } from './geometry';

export type StackDirection = 'vertical' | 'horizontal';
/** Where items sit across the stack: its start, middle or end, or stretched to the widest (tallest) one. */
export type StackAlign = 'start' | 'center' | 'end' | 'stretch';

export interface StackOptions {
  direction?: StackDirection;
  /** Between two items (default 0). */
  gap?: number;
  /** Inside the stack's edge (default 0). */
  padding?: number | Partial<Insets>;
  align?: StackAlign;
  /** A cross size to align in instead of the widest item's (a column as wide as its window). */
  crossSize?: number;
  /** Whole pixels (pixel-perfect UI). */
  snap?: boolean;
}

export interface StackResult extends Size {
  /** One rect per item, in the order given, relative to the stack's top-left. */
  items: Rect[];
}

/**
 * Lays items one after another down (or across) with a gap, inside padding. The stack's size is what the items
 * need, so a parent can lay the stack out in turn. Pure, for canvas widgets and DOM/React layouts alike.
 */
export function stackLayout(sizes: readonly Size[], options: StackOptions = {}): StackResult {
  const vertical = (options.direction ?? 'vertical') === 'vertical';
  const gap = options.gap ?? 0;
  const pad = insets(options.padding);
  const align = options.align ?? 'start';
  const snap = options.snap ?? false;
  let cross = 0;
  for (const s of sizes) cross = Math.max(cross, vertical ? s.width : s.height);
  if (options.crossSize !== undefined) cross = options.crossSize;
  const items: Rect[] = [];
  let main = vertical ? pad.top : pad.left;
  const crossStart = vertical ? pad.left : pad.top;
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i]!;
    const itemMain = vertical ? s.height : s.width;
    let itemCross = vertical ? s.width : s.height;
    let offset = 0;
    if (align === 'stretch') itemCross = cross;
    else if (align === 'center') offset = (cross - itemCross) / 2;
    else if (align === 'end') offset = cross - itemCross;
    const a = snapPx(main, snap);
    const b = snapPx(crossStart + offset, snap);
    const len = snapPx(itemMain, snap);
    const thick = snapPx(itemCross, snap);
    items.push(vertical ? { x: b, y: a, width: thick, height: len } : { x: a, y: b, width: len, height: thick });
    main += itemMain + (i < sizes.length - 1 ? gap : 0);
  }
  const mainEnd = main + (vertical ? pad.bottom : pad.right);
  const crossEnd = crossStart + cross + (vertical ? pad.right : pad.bottom);
  return {
    items,
    width: snapPx(vertical ? crossEnd : mainEnd, snap),
    height: snapPx(vertical ? mainEnd : crossEnd, snap),
  };
}
