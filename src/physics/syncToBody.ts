import type { Body } from './Body';

/** Anything with a settable position: a Pixi container, a sprite, a plain object. */
export interface Positioned {
  x: number;
  y: number;
}

/**
 * Places `view` where `body` is drawn this frame: between its last two step positions by the loop's `alpha`
 * (`SystemContext.alpha` in a `frame` system), so motion is smooth at any refresh rate even though physics steps
 * at a fixed rate. Pass `round` for pixel art, so the view lands on whole pixels.
 */
export function syncToBody(view: Positioned, body: Body, alpha: number, offsetX = 0, offsetY = 0, round = false): void {
  const x = body.prevX + (body.x - body.prevX) * alpha + offsetX;
  const y = body.prevY + (body.y - body.prevY) * alpha + offsetY;
  view.x = round ? Math.round(x) : x;
  view.y = round ? Math.round(y) : y;
}
