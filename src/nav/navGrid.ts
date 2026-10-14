import { isSolidTile, type CollisionGrid } from '../net/movement';

/** A tile coordinate. */
export interface TilePoint {
  x: number;
  y: number;
}

/**
 * The ground a search walks: a width, a height and whether a body may stand on a tile. `walkable` is never asked
 * about a tile outside the grid, so a game's own test needs no bounds check.
 */
export interface NavGrid {
  readonly width: number;
  readonly height: number;
  walkable(tx: number, ty: number): boolean;
}

/** What a search may be told beyond the grid, shared by `findPath`, `floodFill` and `straightenPath`. */
export interface NavOptions {
  /**
   * Extra cost of stepping onto a tile, on top of the step itself (1 straight, √2 diagonal). Must not be negative,
   * or A* stops being exact. `nearWallCost` is one: it keeps a route off the edges of a clearing.
   */
  cost?: (tx: number, ty: number) => number;
  /**
   * Tiles a path may end on but never pass through or brush past diagonally: a door that throws a body onto another
   * map, a trap, a ledge. A start standing on one may still leave it.
   */
  endOnly?: (tx: number, ty: number) => boolean;
}

/** A grid over any walkability test. */
export function navGrid(width: number, height: number, walkable: (tx: number, ty: number) => boolean): NavGrid {
  return { width, height, walkable };
}

/** The engine's own collision grid as ground to search: a tile a body cannot stand on is a wall. */
export function navGridFromCollision(grid: CollisionGrid): NavGrid {
  return { width: grid.width, height: grid.height, walkable: (tx, ty) => !isSolidTile(grid, tx, ty) };
}

/** Inside the grid and walkable. */
export function isOpen(g: NavGrid, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < g.width && ty < g.height && g.walkable(tx, ty);
}

/**
 * A `cost` that charges `extra` for a tile with a wall beside it (four-way), so a route prefers the middle of a
 * clearing to the gap between two obstacles — the narrow way is where an auto-walking body wedges itself. 1.4 was
 * high enough to go round a thicket and low enough to still take a gate.
 */
export function nearWallCost(g: NavGrid, extra = 1.4): (tx: number, ty: number) => number {
  return (x, y) => (!isOpen(g, x + 1, y) || !isOpen(g, x - 1, y) || !isOpen(g, x, y + 1) || !isOpen(g, x, y - 1) ? extra : 0);
}

/** Eight-way steps; the diagonals cost √2 so a path does not zig-zag where a straight line would do. */
export const NAV_STEPS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * May a body step from (cx, cy) by (dx, dy)? The tile must be open and, when it is end-only, be the goal; a diagonal
 * may not cut the corner between two walls, nor brush an end-only tile on the way past.
 */
export function canStep(
  g: NavGrid,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  endOnly: ((tx: number, ty: number) => boolean) | undefined,
  isGoal: (tx: number, ty: number) => boolean,
): boolean {
  const nx = cx + dx;
  const ny = cy + dy;
  if (!isOpen(g, nx, ny)) return false;
  if (endOnly && endOnly(nx, ny) && !isGoal(nx, ny)) return false;
  if (dx !== 0 && dy !== 0) {
    if (!isOpen(g, cx + dx, cy) || !isOpen(g, cx, cy + dy)) return false;
    if (endOnly && ((endOnly(cx + dx, cy) && !isGoal(cx + dx, cy)) || (endOnly(cx, cy + dy) && !isGoal(cx, cy + dy)))) return false;
  }
  return true;
}
