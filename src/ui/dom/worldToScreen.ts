/** A layer's transform as drawn: `stage.world` (a Pixi container) fits it, with the camera and its shake applied. */
export interface LayerTransform {
  readonly x: number;
  readonly y: number;
  readonly scale: { readonly x: number; readonly y: number };
}

/**
 * Where a world point is on the overlay, in CSS pixels: through the world layer's own transform (so the camera's
 * zoom, scroll and shake are all in it), times how much CSS stretches the canvas (`cssScale`, 1 normally). Writes
 * into `out`: called for every placed element every frame.
 */
export function worldToScreen(layer: LayerTransform, wx: number, wy: number, out: { x: number; y: number }, cssScale = 1): { x: number; y: number } {
  out.x = (layer.x + wx * layer.scale.x) * cssScale;
  out.y = (layer.y + wy * layer.scale.y) * cssScale;
  return out;
}

/** Whether a point is on a `width` × `height` screen, or within `margin` of it (an element's own size past the point). */
export function onScreen(x: number, y: number, width: number, height: number, margin = 0): boolean {
  return x >= -margin && y >= -margin && x <= width + margin && y <= height + margin;
}
