/**
 * The shapes every UI layout function speaks: plain objects, no Pixi and no DOM, so the same maths places a canvas
 * widget, a DOM panel or a React component.
 */
export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point, Size {}

/** Space kept clear on each side (padding, margins, a phone's safe area). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** `8` or `{ top: 8, left: 4 }` → all four sides; a missing side is 0. */
export function insets(v: number | Partial<Insets> | undefined): Insets {
  if (v === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof v === 'number') return { top: v, right: v, bottom: v, left: v };
  return { top: v.top ?? 0, right: v.right ?? 0, bottom: v.bottom ?? 0, left: v.left ?? 0 };
}

/**
 * Rounds to a whole pixel when `on`. Pixel art laid out at x.5 lands each texel across two screen pixels and reads
 * blurred or a pixel wider on one side, so a pixel-perfect game snaps every UI position and size.
 */
export function snapPx(v: number, on = true): number {
  return on ? Math.round(v) : v;
}

/**
 * A rect with its edges (not its size) rounded: two neighbours that touch before snapping still touch after, where
 * rounding x and width apart could open or overlap a pixel between them.
 */
export function snapRect(r: Rect, on = true): Rect {
  if (!on) return { x: r.x, y: r.y, width: r.width, height: r.height };
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  return { x, y, width: Math.round(r.x + r.width) - x, height: Math.round(r.y + r.height) - y };
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
