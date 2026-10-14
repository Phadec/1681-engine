/**
 * The arithmetic of parallax, apart from anything that draws so it can be tested under node. One axis at a time:
 * the same functions serve x and y.
 */

/**
 * The world position a layer is drawn at so that, on screen, it moves `factor` times as far as the camera: 0 stays
 * fixed to the screen (a sky at infinity), 1 moves with the world, 0.5 at half speed, above 1 faster (a foreground).
 * The layer lives in the world layer, so the camera's zoom scales it like everything else.
 */
export function parallaxOrigin(scroll: number, factor: number, offset = 0): number {
  return scroll * (1 - factor) + offset;
}

/** `value` brought into [0, size): where a repeating pattern stands within one tile. 0 for an empty tile. */
export function wrap(value: number, size: number): number {
  if (!(size > 0)) return 0;
  const r = value % size;
  // `+ 0` turns the -0 a negative multiple leaves into 0, which a tile position compares equal to anyway
  return r < 0 ? r + size : r + 0;
}

/** Whether a span [start, start + size) overlaps the view [viewStart, viewStart + viewSize), `margin` px wider. */
export function spanVisible(start: number, size: number, viewStart: number, viewSize: number, margin = 0): boolean {
  return start < viewStart + viewSize + margin && start + size > viewStart - margin;
}

/** Where one axis of a layer goes this frame; written into a caller's object so a frame allocates nothing. */
export interface AxisPlacement {
  /** The layer's world position on this axis. */
  position: number;
  /** For a repeated axis, how long the tiled strip is (it covers the view); otherwise the content's own size. */
  size: number;
  /** For a repeated axis, the pattern's offset inside the strip (a tiling sprite's tile position), in [0, tile). */
  phase: number;
  /** For an axis that does not repeat, whether the content reaches into the view at all. */
  visible: boolean;
}

export interface AxisInput {
  /** The camera's scroll on this axis (the world coordinate at the screen's edge). */
  scroll: number;
  /** How much of the world the view shows on this axis: the screen's size over the camera's zoom. */
  view: number;
  factor: number;
  /** Fixed offset plus whatever auto-scroll has added. */
  offset: number;
  repeat: boolean;
  /** One tile's size on this axis (repeated axes). */
  tile: number;
  /** Where the content's bounds begin from the layer's position, and how long they are (axes that do not repeat). */
  contentStart: number;
  contentSize: number;
  /** Land on whole world pixels. */
  snap: boolean;
}

/**
 * Places one axis. A repeated axis is a strip laid over the view, starting at the view's edge (floored to a whole
 * pixel when snapping), whose pattern is shifted so its tiles stand where the parallax puts them: the strip never
 * grows with the level, however long it is. An axis that does not repeat sits at its parallax origin and is visible
 * only while its content overlaps the view.
 */
export function placeAxis(out: AxisPlacement, a: AxisInput): AxisPlacement {
  let origin = parallaxOrigin(a.scroll, a.factor, a.offset);
  if (a.snap) origin = Math.round(origin);
  if (a.repeat && a.tile > 0) {
    const start = a.snap ? Math.floor(a.scroll) : a.scroll;
    out.position = start;
    // one pixel more than the view, for the part of a pixel the floor gave back
    out.size = Math.ceil(a.view) + 1;
    out.phase = wrap(origin - start, a.tile);
    out.visible = true;
  } else {
    out.position = origin;
    out.size = a.contentSize;
    out.phase = 0;
    out.visible = spanVisible(origin + a.contentStart, a.contentSize, a.scroll, a.view);
  }
  return out;
}
