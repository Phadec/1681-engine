import { type RefObject, useEffect, useLayoutEffect } from 'react';
import type { Point } from '../ui/layout/geometry';
import { windowStyle } from './placement';
import { useUi } from './UiProvider';

export interface FitTarget {
  /** Off: the element is left to the stylesheet (a touch sheet). */
  enabled: boolean;
  /** The width it wants, in its own units; default: its laid-out width. */
  width?: number;
  /** Where it wants to stand (screen pixels); default: centred. */
  at?: Point;
}

/** The scrolling part of a window: what is cut when the window does not fit. */
export const SCROLL_CLASS = 'e1681-scroll';

/**
 * Keeps a window or dialog inside the viewport (`windowStyle` → `fitToViewport`): measured after every render, on a
 * resize and when its content changes size, written straight onto the element's style so a placement never costs a
 * render. The natural height is the element's plus what its scrolling body (`.e1681-scroll`) hides, so the cap never
 * has to be lifted to measure, which would throw the body's scroll back to the top.
 */
export function useFitToViewport(ref: RefObject<HTMLElement | null>, target: FitTarget): void {
  const ui = useUi();
  const { enabled, width } = target;
  const atX = target.at?.x;
  const atY = target.at?.y;

  const place = () => {
    const el = ref.current;
    if (!el || !enabled) return;
    const body = el.querySelector<HTMLElement>(`.${SCROLL_CLASS}`);
    const hidden = body ? body.scrollHeight - body.clientHeight : 0;
    const wanted = {
      width: width ?? Math.max(el.offsetWidth, el.scrollWidth),
      height: el.offsetHeight + Math.max(0, hidden),
      ...(atX !== undefined && atY !== undefined ? { x: atX, y: atY } : {}),
    };
    const { style } = windowStyle(wanted, ui.viewport(), { scale: ui.scale, minScale: ui.minScale, margin: ui.margin, snap: ui.snap });
    const s = el.style;
    s.left = `${style.left}px`;
    s.top = `${style.top}px`;
    s.maxWidth = `${style.maxWidth}px`;
    s.maxHeight = `${style.maxHeight}px`;
    s.transform = (style.transform as string | undefined) ?? '';
    s.transformOrigin = (style.transformOrigin as string | undefined) ?? '';
  };

  useLayoutEffect(place);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    const body = el?.querySelector<HTMLElement>(`.${SCROLL_CLASS}`);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => place());
    for (const child of Array.from(body?.children ?? [])) ro?.observe(child);
    window.addEventListener('resize', place);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', place);
    };
    // `place` reads the ref and the settings fresh each time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, width, atX, atY, ui]);
}
