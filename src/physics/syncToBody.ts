import type { Body } from './Body';

/** Anything with a settable position: a Pixi container, a sprite, a plain object. */
export interface Positioned {
  x: number;
  y: number;
  /** Set to the body's angle when the body rotates or stands at an angle; left alone otherwise. */
  rotation?: number;
}

/**
 * Places `view` where `body` is drawn this frame: between its last two step positions by the loop's `alpha`
 * (`SystemContext.alpha` in a `frame` system), so motion is smooth at any refresh rate even though physics steps
 * at a fixed rate. Pass `round` for pixel art, so the view lands on whole pixels. A body that rotates (or was placed
 * at an angle) turns the view too, by the shorter way between its last two angles; the offset is turned with it.
 */
export function syncToBody(view: Positioned, body: Body, alpha: number, offsetX = 0, offsetY = 0, round = false): void {
  let x = body.prevX + (body.x - body.prevX) * alpha;
  let y = body.prevY + (body.y - body.prevY) * alpha;
  if (body.rotates || body.angle !== 0) {
    let d = body.angle - body.prevAngle;
    if (d > Math.PI || d < -Math.PI) d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
    const angle = body.prevAngle + d * alpha;
    if (offsetX !== 0 || offsetY !== 0) {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      x += c * offsetX - s * offsetY;
      y += s * offsetX + c * offsetY;
    }
    view.rotation = angle;
  } else {
    x += offsetX;
    y += offsetY;
  }
  view.x = round ? Math.round(x) : x;
  view.y = round ? Math.round(y) : y;
}
