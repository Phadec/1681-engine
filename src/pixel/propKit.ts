import { P } from './palette';
import { type Color, PixelGrid, rgba } from './pixel';
import { hueShade, outlineOf } from './ramp';

/*
 * Pieces for painting map props (trees, rocks, buildings) in code. A prop is anchored at the bottom-centre of its tile
 * footprint: `anchorX/anchorY` are pixel coordinates inside its canvas.
 */

export interface PropArt {
  canvas: HTMLCanvasElement;
  anchorX: number;
  anchorY: number;
}

export function art(g: PixelGrid, anchorX: number, anchorY: number): PropArt {
  return { canvas: g.toCanvas(), anchorX, anchorY };
}

/**
 * The selective outline a prop takes, lit from the upper left like the map: the same ring a plain outline lays, but
 * full dark only where the silhouette meets the ground (under it) and on its shadow side (the right); along the top
 * and the left it is the darkest tone of the fill it borders (`outlineOf`), so a lit edge reads as the thing's own
 * shade rather than a sticker's line. Translucent pixels (a cast
 * shadow on the ground) are not part of the silhouette.
 */
export function litOutline(g: PixelGrid, dark: Color = P.outline): void {
  const { w, h } = g;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = g.data[i]! >>> 24 === 255 ? 1 : 0;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && on[y * w + x] === 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (on[y * w + x]) continue;
      const above = at(x, y - 1);
      const left = at(x - 1, y);
      const right = at(x + 1, y);
      const below = at(x, y + 1);
      if (!(above || left || right || below)) continue;
      g.px(x, y, above || left ? dark : outlineOf(g.get(right ? x + 1 : x, right ? y : y + 1)));
    }
}

/**
 * A soft shadow thrown down and to the right onto the ground, laid only on empty pixels (call it after `litOutline`,
 * or the outline would ring the shadow): a darker `core` and a fainter `rim`, by default a translucent violet.
 */
export function groundShadow(g: PixelGrid, cx: number, cy: number, rx: number, ry: number, core: Color = SHADOW_CORE, rim: Color = SHADOW_RIM): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (!g.inBounds(x, y) || g.alphaAt(x, y)) continue;
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 0.55) g.px(x, y, core);
      else if (d <= 1) g.px(x, y, rim);
    }
}

const SHADOW_CORE = rgba(26, 22, 44, 78);
const SHADOW_RIM = rgba(26, 22, 44, 40);
/*
 * ── Ramp-shaded pieces ──
 * `shadeBox` shades with hue-shifted ramps (`ramp.ts`) instead of `shade`; with `litOutline` above, a prop painted
 * with them looks like rig-drawn people standing next to it.
 */

/**
 * Moves every opaque pixel of a box one step into shadow (or, with `f > 1`, into light) along its own hue: the eave's
 * shadow on a wall, the dark side of a chimney, a porch's shade. `mask` limits it to some pixels of the box.
 */
export function shadeBox(g: PixelGrid, x: number, y: number, w: number, h: number, f: number, mask?: (x: number, y: number) => boolean): void {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      if (!g.inBounds(xx, yy)) continue;
      const c = g.get(xx, yy);
      if (!(c >>> 24) || (mask && !mask(xx, yy))) continue;
      g.px(xx, yy, hueShade(c, f, 'shadow'));
    }
}
