import { type RefObject, useEffect, useLayoutEffect } from 'react';

/** Never shorter than this (CSS px), however much sits above it. */
const MIN_HEIGHT = 180;

/**
 * Fills what is left of a touch sheet's scrolling body (`.e1681-panel-body`) below whatever sits above the element —
 * tabs, a note — so a list-and-detail fits without the body scrolling; a stylesheet's `100vh - 120px` guesses one
 * layout and scrolls in every other. Measured after every render and on every resize; with `fit` it caps the height
 * instead of setting it. Outside a panel body the stylesheet's height stands.
 */
export function useFillSheet(ref: RefObject<HTMLElement | null>, active: boolean, fit: boolean): void {
  const measure = () => {
    const el = ref.current;
    const body = el?.closest<HTMLElement>('.e1681-panel-body');
    if (!el || !body) return;
    const offset = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    const pad = Number.parseFloat(getComputedStyle(body).paddingBottom) || 0;
    const px = `${Math.max(MIN_HEIGHT, Math.floor(body.clientHeight - offset - pad))}px`;
    if (fit) el.style.maxHeight = px;
    else el.style.height = px;
  };
  useLayoutEffect(() => {
    if (active) measure();
  });
  useEffect(() => {
    if (!active) return;
    const body = ref.current?.closest<HTMLElement>('.e1681-panel-body');
    const ro = typeof ResizeObserver === 'undefined' || !body ? null : new ResizeObserver(() => measure());
    if (body) ro?.observe(body);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
    // measure reads the ref and `fit` fresh each time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, fit]);
}
