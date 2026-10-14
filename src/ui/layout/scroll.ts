import { clamp } from './geometry';

/** How far content of `content` length can scroll in a window of `viewport` length. */
export function maxScroll(content: number, viewport: number): number {
  return Math.max(0, content - viewport);
}

/** A scroll offset kept between the top and the last full window of content. */
export function clampScroll(offset: number, content: number, viewport: number): number {
  return clamp(offset, 0, maxScroll(content, viewport));
}

/**
 * The smallest scroll that brings an item (`start`, `size` along the scroll axis) fully into view: a list moved by
 * the keyboard follows the focus without jumping when the focus is already visible.
 */
export function scrollIntoView(offset: number, start: number, size: number, viewport: number, content: number): number {
  let next = offset;
  if (start < next) next = start;
  else if (start + size > next + viewport) next = start + size - viewport;
  return clampScroll(next, content, viewport);
}

/** Below this speed (px a second) a fling has stopped. */
export const FLING_STOP = 8;

/**
 * A fling's speed after `dtMs`, losing `friction` of it every 60th of a second: the same glide at any frame rate.
 * 0 once it falls under `FLING_STOP`.
 */
export function stepFling(velocity: number, dtMs: number, friction = 0.06): number {
  const v = velocity * Math.pow(1 - friction, dtMs / (1000 / 60));
  return Math.abs(v) < FLING_STOP ? 0 : v;
}
