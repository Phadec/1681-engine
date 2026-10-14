/**
 * Autotiling: picking each cell's tile from which of its neighbours share its terrain, so a painter only says "wall
 * here, water there" and the borders draw themselves. Two bitmasks are offered:
 *
 * - **edges** (4-bit, 16 tiles): the four sides only. Enough for paths, fences and pipes, and for terrain whose
 *   inner corners need no tile of their own.
 * - **blob** (8-bit reduced to the 47-tile set): the sides and the corners, a corner counting only when both sides
 *   beside it match. Without that reduction 256 masks would need 256 tiles; with it a full terrain (outer edges,
 *   inner corners, thin bridges) needs 47.
 *
 * Pure: no Pixi, no DOM, so a server or a map tool can run the same rules.
 */

/** The edge bits, clockwise from the top. */
export const EDGE_N = 1;
export const EDGE_E = 2;
export const EDGE_S = 4;
export const EDGE_W = 8;

/** The blob bits, clockwise from the top. */
export const BLOB_N = 1;
export const BLOB_NE = 2;
export const BLOB_E = 4;
export const BLOB_SE = 8;
export const BLOB_S = 16;
export const BLOB_SW = 32;
export const BLOB_W = 64;
export const BLOB_NW = 128;

/** A grid of terrain ids, row-major. Any id is fine; the rules say what each one is. */
export interface TerrainGrid {
  width: number;
  height: number;
  cells: ArrayLike<number> & { [i: number]: number };
}

export type AutotileMode = 'edges' | 'blob';

export interface MaskOptions {
  /**
   * Whether a neighbour counts as "the same" for `terrain` (default: the same id). A rule's `connectsTo` builds one:
   * grass that also joins flowers, a wall that also joins a door.
   */
  joins?: (terrain: number, neighbour: number) => boolean;
  /**
   * What lies outside the grid: `'same'` (default) joins the edge so a terrain running off the map shows no border;
   * `'other'` closes it.
   */
  edge?: 'same' | 'other';
}

/** Drops each corner bit unless both sides beside it are set: what the 47-tile blob set is drawn for. */
export function reduceBlobMask(mask: number): number {
  let m = mask & (BLOB_N | BLOB_E | BLOB_S | BLOB_W);
  if (mask & BLOB_NE && mask & BLOB_N && mask & BLOB_E) m |= BLOB_NE;
  if (mask & BLOB_SE && mask & BLOB_S && mask & BLOB_E) m |= BLOB_SE;
  if (mask & BLOB_SW && mask & BLOB_S && mask & BLOB_W) m |= BLOB_SW;
  if (mask & BLOB_NW && mask & BLOB_N && mask & BLOB_W) m |= BLOB_NW;
  return m;
}

/** The 47 reduced blob masks in ascending order; a tileset laid out in that order is indexed by `blob47Index`. */
export const BLOB47_MASKS: readonly number[] = (() => {
  const set = new Set<number>();
  for (let m = 0; m < 256; m++) set.add(reduceBlobMask(m));
  return [...set].sort((a, b) => a - b);
})();

const BLOB_INDEX = new Map(BLOB47_MASKS.map((m, i) => [m, i]));

/** Where a blob mask (reduced or not) sits among the 47: 0…46. */
export function blob47Index(mask: number): number {
  return BLOB_INDEX.get(reduceBlobMask(mask))!;
}

// the eight neighbours as [dx, dy, blob bit], clockwise from the top
const AROUND: readonly (readonly [number, number, number])[] = [
  [0, -1, BLOB_N],
  [1, -1, BLOB_NE],
  [1, 0, BLOB_E],
  [1, 1, BLOB_SE],
  [0, 1, BLOB_S],
  [-1, 1, BLOB_SW],
  [-1, 0, BLOB_W],
  [-1, -1, BLOB_NW],
];

function joinsAt(grid: TerrainGrid, terrain: number, x: number, y: number, o: MaskOptions): boolean {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return (o.edge ?? 'same') === 'same';
  const n = grid.cells[y * grid.width + x]!;
  return o.joins ? o.joins(terrain, n) : n === terrain;
}

/** The 4-bit edge mask of cell (x, y): `EDGE_*` set for each side whose neighbour joins it. */
export function edgeMask(grid: TerrainGrid, x: number, y: number, options: MaskOptions = {}): number {
  const t = grid.cells[y * grid.width + x]!;
  return (
    (joinsAt(grid, t, x, y - 1, options) ? EDGE_N : 0) |
    (joinsAt(grid, t, x + 1, y, options) ? EDGE_E : 0) |
    (joinsAt(grid, t, x, y + 1, options) ? EDGE_S : 0) |
    (joinsAt(grid, t, x - 1, y, options) ? EDGE_W : 0)
  );
}

/** The reduced 8-bit blob mask of cell (x, y): one of `BLOB47_MASKS`. */
export function blobMask(grid: TerrainGrid, x: number, y: number, options: MaskOptions = {}): number {
  const t = grid.cells[y * grid.width + x]!;
  let m = 0;
  for (const [dx, dy, bit] of AROUND) if (joinsAt(grid, t, x + dx, y + dy, options)) m |= bit;
  return reduceBlobMask(m);
}

/** How one terrain picks its tiles. */
export interface AutotileRule {
  /** The terrain id this rule draws. */
  terrain: number;
  /** Which mask picks the tile (default `'blob'`). */
  mode?: AutotileMode;
  /**
   * The tile for a mask: a table by mask (a list picks one of several by the cell's position, the same every time),
   * or a function of the mask (and the cell, for anything fancier). Blob masks are the reduced ones; to lay a
   * 47-tile set out in `BLOB47_MASKS` order use `(m) => first + blob47Index(m)`. Edge masks run 0…15, so a 16-tile
   * strip in mask order is `(m) => first + m`.
   */
  tiles: Readonly<Record<number, number | readonly number[]>> | ((mask: number, x: number, y: number) => number);
  /** The tile when the table has no entry for a mask (default: the entry for the full mask, else `empty`). */
  fallback?: number;
  /** Other terrain ids this one joins as if they were its own (a road meeting a bridge). */
  connectsTo?: readonly number[];
}

/** Read once, the first time it is used (compiled lookups are kept per object): build a new set to change the rules. */
export interface AutotileRuleSet {
  rules: readonly AutotileRule[];
  /** The tile for a terrain no rule draws (default 0, an empty cell). */
  empty?: number;
  /** What lies outside the grid; see `MaskOptions.edge`. */
  edge?: 'same' | 'other';
}

/** A position hash for picking among variants: stable per cell, so a repaint never shuffles them. */
function cellHash(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return (h ^ (h >>> 12)) >>> 0;
}

const FULL: Record<AutotileMode, number> = { edges: 15, blob: 255 };

/** Rules compiled once per rule set: the lookups `autotile` and `updateAutotile` share. */
const compiled = new WeakMap<AutotileRuleSet, Map<number, { rule: AutotileRule; options: MaskOptions }>>();

function compile(set: AutotileRuleSet): Map<number, { rule: AutotileRule; options: MaskOptions }> {
  let byTerrain = compiled.get(set);
  if (byTerrain) return byTerrain;
  byTerrain = new Map();
  for (const rule of set.rules) {
    const others = rule.connectsTo ? new Set(rule.connectsTo) : null;
    const options: MaskOptions = { edge: set.edge ?? 'same' };
    if (others) options.joins = (t, n) => n === t || others.has(n);
    byTerrain.set(rule.terrain, { rule, options });
  }
  compiled.set(set, byTerrain);
  return byTerrain;
}

function pick(entry: number | readonly number[] | undefined, x: number, y: number): number | undefined {
  if (entry === undefined || typeof entry === 'number') return entry;
  return entry.length ? entry[cellHash(x, y) % entry.length] : undefined;
}

/** The tile cell (x, y) gets under `set`. */
export function autotileAt(grid: TerrainGrid, set: AutotileRuleSet, x: number, y: number): number {
  const c = compile(set).get(grid.cells[y * grid.width + x]!);
  if (!c) return set.empty ?? 0;
  const mode = c.rule.mode ?? 'blob';
  const mask = mode === 'blob' ? blobMask(grid, x, y, c.options) : edgeMask(grid, x, y, c.options);
  const { tiles } = c.rule;
  if (typeof tiles === 'function') return tiles(mask, x, y);
  return pick(tiles[mask], x, y) ?? c.rule.fallback ?? pick(tiles[FULL[mode]], x, y) ?? set.empty ?? 0;
}

/** Every cell's tile, row-major: the whole grid autotiled. */
export function autotile(grid: TerrainGrid, set: AutotileRuleSet, out = new Uint32Array(grid.width * grid.height)): Uint32Array {
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) out[y * grid.width + x] = autotileAt(grid, set, x, y);
  return out;
}

/**
 * After cell (x, y) changed terrain, retiles it and its eight neighbours (the only cells whose masks can change)
 * into `out`. Returns the indices whose tile actually changed, so a view repaints only those.
 */
export function updateAutotile(grid: TerrainGrid, set: AutotileRuleSet, out: Uint32Array, x: number, y: number): number[] {
  const changed: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= grid.width || cy >= grid.height) continue;
      const i = cy * grid.width + cx;
      const tile = autotileAt(grid, set, cx, cy);
      if (out[i] !== tile) {
        out[i] = tile;
        changed.push(i);
      }
    }
  }
  return changed;
}

/** Sets cell (x, y) to `terrain` and retiles around it; the changed indices, as `updateAutotile` returns them. */
export function paintTerrain(grid: TerrainGrid, set: AutotileRuleSet, out: Uint32Array, x: number, y: number, terrain: number): number[] {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return [];
  grid.cells[y * grid.width + x] = terrain;
  return updateAutotile(grid, set, out, x, y);
}
