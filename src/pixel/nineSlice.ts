import { CLEAR, PixelGrid, channels, hex, type Color } from './pixel';

/**
 * Pixel-art 9-slice frames for a UI (windows, buttons, fields, wells), built from one drawn corner so the edge is
 * whole pixels instead of CSS gradients and blurred shadows. The corner is ASCII, one letter a role; the other three
 * corners are its mirrors, and on the far side (right and bottom) each role takes its **twin** — a raised frame's lit
 * rim (H) becomes its dark rim (L), a sunk field's shadowed lip (D) its lit one (d) — so light comes from the up-left
 * without drawing four corners. A hard shadow (the frame's own silhouette, shifted) can lie under it.
 *
 * ```ts
 * const frame = nineSlice({ corner: FRAME_CORNERS.panel, palette: { K: '#0b1018', H: '#c9a869', L: '#4a3a24',
 *   M: '#8b6e45', G: '#121820', S: '#3c434b', s: '#161b22', F: '#1d242e', R: '#ffe2a0' }, shadow: [2, 2] });
 * frame.grid.toCanvas();              // a canvas for a Pixi NineSliceSprite, with frame.insets
 * frameSvg(frame.grid, 2);            // or an SVG for a CSS border-image, sliced at insets × 2
 * ```
 */

/** Ready corners in the roles the default twins know: K ink, H/L lit/dark rim, M/m rim, G/g gap, S/s bevel, F fill, D/d lip, R rivet. */
export const FRAME_CORNERS = {
  /** A window: ink, a two-step brass rim, a gap, a lit bevel, a rivet in the corner. */
  panel: ['..KKKKKK', '.KHHHHHH', 'KHHMMMMM', 'KHMKGGGG', 'KHMGRSSS', 'KHMGSFFF', 'KHMGSFFF', 'KHMGSFFF'],
  /** A raised button: a two-step bevel, notched. Give it shadow [0, 1]; pressed, offset [0, 1] with the bevel's colours swapped. */
  button: ['.KKKK', 'KHHHH', 'KHMMM', 'KHMFF', 'KHMFF'],
  /** A small raised button. */
  smallButton: ['.KKK', 'KHHH', 'KHMM', 'KHMF'],
  /** A text field: a hole in the stone, its lip in shadow top-left (D, G) and lit bottom-right (d, g). */
  field: ['.KKKK', 'KDDDD', 'KDGGG', 'KDGFF', 'KDGFF'],
  /** A sunk well (slots, bars' tracks). */
  well: ['.KK', 'KDD', 'KDF'],
  /** A list row: a flat slab lit on the top and left. */
  row: ['.KK', 'KSS', 'KSF'],
  /** A thin frame: one pixel of rim (toasts, a cast bar). */
  thin: ['.KK', 'KHH', 'KHF'],
} as const satisfies Record<string, readonly string[]>;

/** The role each letter takes on the far side; a palette without the twin keeps the letter. */
export const FRAME_TWINS: Readonly<Record<string, string>> = { H: 'L', S: 's', M: 'm', D: 'd', G: 'g' };

export interface NineSliceSpec {
  /** The top-left corner, square, one letter a role; '.' is nothing. */
  corner: readonly string[];
  /** A colour per letter: a packed `Color` or a CSS hex (`#rgb`, `#rrggbb`, `#rrggbbaa` for see-through fills). */
  palette: Readonly<Record<string, Color | string>>;
  /** Near-side letter → far-side letter (default `FRAME_TWINS`). */
  twins?: Readonly<Record<string, string>>;
  /** The hard shadow's offset in art pixels (default none). */
  shadow?: readonly [number, number];
  /** The shadow's colour (default palette `Z`, else black at 55%). */
  shadowColor?: Color | string;
  /** Moves the frame inside its canvas (a pressed button sits one pixel lower where its shadow was). */
  offset?: readonly [number, number];
  /** Room right and below for the shadow or the offset (default: the shadow). */
  pad?: readonly [number, number];
  /** Rows painted over the frame, the frame's full size ('.' leaves it): a tick in a checkbox. */
  overlay?: readonly string[];
}

/** How far in from each side the corners reach: the frame's slice lines, in art pixels. */
export interface SliceInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface NineSlice {
  grid: PixelGrid;
  insets: SliceInsets;
}

const toColor = (c: Color | string): Color => (typeof c === 'string' ? hex(c) : c);

/** The frame's letter at (x, y) of the n×n square mirrored out of `corner`, '.' outside it. */
function roleAt(corner: readonly string[], palette: NineSliceSpec['palette'], twins: Readonly<Record<string, string>>, x: number, y: number): string {
  const c = corner.length;
  const n = c * 2 + 1;
  const right = x > c;
  const bottom = y > c;
  const cx = right ? n - 1 - x : x;
  const cy = bottom ? n - 1 - y : y;
  const r = corner[Math.min(cy, c - 1)]![Math.min(cx, c - 1)] ?? '.';
  // which edge the cell belongs to in the corner's own coordinates: above the diagonal the top (or bottom) edge
  const onHorizontal = cx >= cy;
  const far = (right && !onHorizontal) || (bottom && onHorizontal) || (right && bottom);
  const twin = twins[r];
  return far && twin && palette[twin] !== undefined ? twin : r;
}

/** Builds the frame: a `(2c + 1 + pad)` square-ish grid and its slice insets. */
export function nineSlice(spec: NineSliceSpec): NineSlice {
  const { corner, palette } = spec;
  const c = corner.length;
  if (!c || corner.some((row) => row.length !== c)) throw new Error('nineSlice: the corner must be square');
  const twins = spec.twins ?? FRAME_TWINS;
  const n = c * 2 + 1;
  const [sx, sy] = spec.shadow ?? [0, 0];
  const [ox, oy] = spec.offset ?? [0, 0];
  const [px, py] = spec.pad ?? [sx, sy];
  const grid = new PixelGrid(n + px, n + py);
  const shade = spec.shadowColor ?? palette.Z ?? 0x8c000000;
  if (sx || sy) {
    const z = toColor(shade);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (roleAt(corner, palette, twins, x, y) !== '.') grid.px(x + sx, y + sy, z);
  }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const over = spec.overlay?.[y]?.[x];
      const r = over && over !== '.' ? over : roleAt(corner, palette, twins, x, y);
      const col = palette[r];
      if (r !== '.' && col !== undefined) grid.px(x + ox, y + oy, toColor(col));
    }
  return { grid, insets: { top: c, left: c, right: c + px, bottom: c + py } };
}

/**
 * Any pixel grid as an SVG of `scale`-sized squares (`shape-rendering="crispEdges"`), runs of one colour on a row
 * merged into one rect: what a CSS `border-image` takes, sliced at the insets × `scale`.
 */
export function frameSvg(grid: PixelGrid, scale = 2): string {
  const rects: string[] = [];
  for (let y = 0; y < grid.h; y++) {
    let x = 0;
    while (x < grid.w) {
      const c = grid.get(x, y);
      let end = x + 1;
      while (end < grid.w && grid.get(end, y) === c) end++;
      if (c !== CLEAR && c >>> 24 > 0) {
        const [r, g, b, a] = channels(c);
        const fill = `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
        const op = a < 255 ? ` fill-opacity="${+(a / 255).toFixed(3)}"` : '';
        rects.push(`<rect x="${x * scale}" y="${y * scale}" width="${(end - x) * scale}" height="${scale}" fill="${fill}"${op}/>`);
      }
      x = end;
    }
  }
  const w = grid.w * scale;
  const h = grid.h * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects.join('')}</svg>\n`;
}
