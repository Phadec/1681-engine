import { memo } from 'react';

/**
 * Small marks (close, check, arrows, a star…) as pixel art on a square grid, drawn in the text's colour. A pixel font
 * usually carries letters and punctuation only, so a ✕, ✓, ▾ or → typed into the UI falls through to a system font
 * and reads as a smooth vector glyph in the middle of pixel text. `scale` is screen pixels per glyph pixel: a whole
 * number, so the mark keeps its pixels square.
 *
 * Rows are strings, one character a pixel: `.` is empty, `X` the text's colour; any other letter takes its colour
 * from the glyph's `tones` (a coloured glyph, lit like the world's art).
 */
export interface GlyphArt {
  rows: readonly string[];
  tones?: Readonly<Record<string, string>>;
}

const BUILT_IN = {
  close: ['X.....X', '.X...X.', '..X.X..', '...X...', '..X.X..', '.X...X.', 'X.....X'],
  check: ['.......', '......X', '.....XX', 'X...XX.', 'XX.XX..', '.XXX...', '..X....'],
  down: ['.......', '.......', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...', '.......'],
  up: ['.......', '...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.......', '.......'],
  right: ['..X....', '..XX...', '..XXX..', '..XXXX.', '..XXX..', '..XX...', '..X....'],
  left: ['....X..', '...XX..', '..XXX..', '.XXXX..', '..XXX..', '...XX..', '....X..'],
  arrow: ['.......', '....X..', '.....X.', 'XXXXXXX', '.....X.', '....X..', '.......'],
  back: ['..X....', '.XX....', 'XXXXXX.', '.XX...X', '..X...X', '......X', '..XXXX.'],
  star: ['...X...', '...X...', 'XXXXXXX', '.XXXXX.', '..XXX..', '.XX.XX.', 'X.....X'],
  diamond: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  diamondOpen: ['...X...', '..X.X..', '.X...X.', 'X.....X', '.X...X.', '..X.X..', '...X...'],
  menu: ['.......', 'XXXXXXX', '.......', 'XXXXXXX', '.......', 'XXXXXXX', '.......'],
  plus: ['.......', '...X...', '...X...', '.XXXXX.', '...X...', '...X...', '.......'],
  minus: ['.......', '.......', '.......', '.XXXXX.', '.......', '.......', '.......'],
  warn: ['...X...', '..XXX..', '..X.X..', '.XX.XX.', '.X...X.', 'XX.X.XX', 'XXXXXXX'],
  spark: ['...X...', '...X...', '..XXX..', 'XXXXXXX', '..XXX..', '...X...', '...X...'],
  lock: ['..XXX..', '.X...X.', '.X...X.', 'XXXXXXX', 'XXX.XXX', 'XXX.XXX', 'XXXXXXX'],
  pin: ['.XXXXX.', '..XXX..', '..XXX..', '.XXXXX.', 'XXXXXXX', '...X...', '...X...'],
  mail: ['.......', 'XXXXXXX', 'XX...XX', 'X.X.X.X', 'X..X..X', 'X.....X', 'XXXXXXX'],
} as const;

/** The marks the engine draws itself; a game adds its own with `registerGlyph`. */
export type BuiltInGlyph = keyof typeof BUILT_IN;
export type GlyphId = BuiltInGlyph | (string & {});

/** Each glyph as [fill, path] pairs, built once: one pair in the text's colour, or one per tone. */
const LAYERS = new Map<string, { size: number; layers: [string, string][] }>();

/** The cells of one letter as one SVG path of 1x1 squares. */
export function glyphPath(rows: readonly string[], letter: string): string {
  return rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === letter ? [`M${x} ${y}h1v1h-1z`] : []))).join('');
}

/** Adds a mark (or replaces one, a built-in included): a coin in the game's own colours, a class crest. */
export function registerGlyph(id: string, art: GlyphArt | readonly string[]): void {
  const { rows, tones } = Array.isArray(art) ? { rows: art as readonly string[], tones: undefined } : (art as GlyphArt);
  const size = Math.max(rows.length, ...rows.map((r) => r.length));
  const layers: [string, string][] = [];
  if (rows.some((r) => r.includes('X'))) layers.push(['currentColor', glyphPath(rows, 'X')]);
  for (const [letter, fill] of Object.entries(tones ?? {})) layers.push([fill, glyphPath(rows, letter)]);
  LAYERS.set(id, { size, layers });
}

for (const [id, rows] of Object.entries(BUILT_IN)) registerGlyph(id, rows);

/** Whether `id` has art (built in or registered). */
export function hasGlyph(id: string): boolean {
  return LAYERS.has(id);
}

export interface GlyphProps {
  id: GlyphId;
  /** Screen pixels per glyph pixel (default 2). */
  scale?: number;
  className?: string;
  /** Spoken name; without it the mark is hidden from screen readers (it sits beside words that say it). */
  label?: string;
}

export const Glyph = memo(function Glyph({ id, scale = 2, className, label }: GlyphProps) {
  const art = LAYERS.get(id);
  if (!art) return null;
  const px = art.size * Math.max(1, Math.round(scale));
  return (
    <svg
      className={className ? `e1681-glyph ${className}` : 'e1681-glyph'}
      width={px}
      height={px}
      viewBox={`0 0 ${art.size} ${art.size}`}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {art.layers.map(([fill, d]) => (
        <path key={fill} d={d} fill={fill} />
      ))}
    </svg>
  );
});
