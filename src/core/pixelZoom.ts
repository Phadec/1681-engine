/*
 * Camera zoom for pixel art, pure so it can be tested: a world pixel must land on a whole number of backing pixels,
 * or a sprite drawn at ×1.5 shows its pixels 1 and 2 wide in turn and reads as a different art style. Zoom is
 * therefore a whole number, with at most one fractional step (by default ×1.5) drawn at a renderer resolution that
 * makes it whole again (`zoomResolution`, which `Camera.resolution` and `Camera.snap` then round to).
 */

export interface PixelZoomOptions {
  /** Canvas height (CSS px) worth one zoom step before clamping (default 290: ×2 on a phone held landscape, ×4 at 1080p). */
  pxPerStep?: number;
  /** The least and most zoom a screen gets on its own, before a player's offset (default 2 and 5). */
  baseMin?: number;
  baseMax?: number;
  /** The least and most zoom any offset may reach (default 1 and 6). */
  min?: number;
  max?: number;
  /** The one fractional zoom allowed, or null for whole steps only (default 1.5). */
  halfZoom?: number | null;
}

const DEFAULTS: Required<PixelZoomOptions> = { pxPerStep: 290, baseMin: 2, baseMax: 5, min: 1, max: 6, halfZoom: 1.5 };

function opts(o: PixelZoomOptions | undefined): Required<PixelZoomOptions> {
  return o ? { ...DEFAULTS, ...o } : DEFAULTS;
}

/**
 * The zoom a screen this tall gets on its own: one step per `pxPerStep` of height, within `baseMin`–`baseMax`.
 * With the defaults a 375–440-px phone held landscape gets 2 (about 200 world px tall: ×1 drew a 24-px character
 * 4 mm tall, ×3 left less than a monster's reach on screen), a 720p window 2, 1080p 4.
 */
export function baseZoom(canvasHeight: number, options?: PixelZoomOptions): number {
  const o = opts(options);
  return Math.max(o.baseMin, Math.min(o.baseMax, Math.round(canvasHeight / o.pxPerStep)));
}

/**
 * The camera zoom (screen px per world px) for a canvas this tall, moved `offset` steps by the player (rounded to
 * half steps), within `min`–`max`. Whole, or exactly `halfZoom`: a half step anywhere else rounds to the whole one.
 */
export function worldZoom(canvasHeight: number, offset = 0, options?: PixelZoomOptions): number {
  const o = opts(options);
  const z = Math.max(o.min, Math.min(o.max, baseZoom(canvasHeight, o) + Math.round(offset * 2) / 2));
  return Number.isInteger(z) || z === o.halfZoom ? z : Math.round(z);
}

/**
 * The zoom steps to offer a player on a screen this tall, by zoom from farthest to nearest: each of `offsets`
 * and, where it lies below the screen's own zoom and no further than `lowest`, the offset that lands on `halfZoom`.
 * Two offsets giving the same zoom are offered once, the one nearer 0 kept.
 */
export function zoomSteps(
  canvasHeight: number,
  offsets: readonly number[] = [-2, -1, 0, 1],
  lowest = -2.5,
  options?: PixelZoomOptions,
): { offset: number; zoom: number }[] {
  const o = opts(options);
  const all = [...offsets];
  if (o.halfZoom !== null) {
    const half = o.halfZoom - baseZoom(canvasHeight, o);
    if (half < 0 && half >= lowest) all.push(half);
  }
  const byZoom = new Map<number, number>();
  for (const offset of all) {
    const zoom = worldZoom(canvasHeight, offset, o);
    const kept = byZoom.get(zoom);
    if (kept === undefined || Math.abs(offset) < Math.abs(kept)) byZoom.set(zoom, offset);
  }
  return [...byZoom].map(([zoom, offset]) => ({ offset, zoom })).sort((a, b) => a.zoom - b.zoom);
}

/**
 * The renderer's resolution for a zoom: 1 at a whole zoom (one backing pixel per CSS pixel, the cheapest fill), and at
 * a fractional one the least whole resolution up to `maxResolution` (default 4) that makes `zoom × resolution` whole
 * (2 at ×1.5, so a world pixel is 3 backing pixels) — but only on a screen of `devicePixelRatio` ≥ `minDpr`
 * (default 1.5): a coarser one cannot show the difference and would pay the fill for nothing. 1 when none fits.
 */
export function zoomResolution(zoom: number, devicePixelRatio: number, minDpr = 1.5, maxResolution = 4): number {
  if (Number.isInteger(zoom) || devicePixelRatio < minDpr) return 1;
  for (let r = 2; r <= maxResolution; r++) {
    const k = zoom * r;
    if (Math.abs(k - Math.round(k)) < 1e-9) return r;
  }
  return 1;
}

/**
 * The whole-number scale content of this size is drawn at to fit a box (a map panel, a preview): the largest integer
 * that fits both ways, never below 1, so every source pixel is the same number of screen pixels.
 */
export function fitScale(contentW: number, contentH: number, boxW: number, boxH: number): number {
  if (contentW <= 0 || contentH <= 0) return 1;
  return Math.max(1, Math.floor(Math.min(boxW / contentW, boxH / contentH)));
}
