import { canStep, type NavGrid, type NavOptions, type TilePoint } from './navGrid';

/** How many tiles ahead `straightenPath` looks for a straighter way: enough for a long staircase, cheap per re-solve. */
const WINDOW = 48;

/**
 * The same route with fewer turns. An eight-way search finds many equally short paths and hands back whichever its
 * heap settled on, often a staircase — diagonal, straight, diagonal, straight — and a body walking one turns on every
 * tile. Each stretch that can be is replaced with the plainest equal way through it: one diagonal run and one straight
 * run. A replacement must cost no more than the stretch did (by the same `cost`, so it never trades the middle of a
 * clearing for the edge of a wall), step only where the search could, and touch no end-only tile short of the end.
 * Pass the options the path was found with.
 */
export function straightenPath(g: NavGrid, path: readonly TilePoint[], options: NavOptions = {}): TilePoint[] {
  if (path.length < 3) return path.slice();
  const extra = options.cost;
  const stepCost = (x: number, y: number, diagonal: boolean) => (diagonal ? Math.SQRT2 : 1) + (extra ? extra(x, y) : 0);
  const upTo = [0];
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1]!;
    const b = path[k]!;
    upTo.push(upTo[k - 1]! + stepCost(b.x, b.y, a.x !== b.x && a.y !== b.y));
  }
  const last = path[path.length - 1]!;
  const out: TilePoint[] = [path[0]!];
  let i = 0;
  while (i < path.length - 1) {
    let taken = false;
    for (let j = Math.min(path.length - 1, i + WINDOW); j >= i + 2 && !taken; j--) {
      const budget = upTo[j]! - upTo[i]! + 1e-6;
      for (const diagonalFirst of [true, false]) {
        const legs = twoLegs(g, path[i]!, path[j]!, diagonalFirst, options.endOnly, last, budget, stepCost);
        if (!legs) continue;
        out.push(...legs);
        i = j;
        taken = true;
        break;
      }
    }
    if (!taken) out.push(path[++i]!);
  }
  return out;
}

/** The tiles after `a` up to `b` along one diagonal run and one straight run, or null when that way is shut or dearer. */
function twoLegs(
  g: NavGrid,
  a: TilePoint,
  b: TilePoint,
  diagonalFirst: boolean,
  endOnly: ((tx: number, ty: number) => boolean) | undefined,
  last: TilePoint,
  budget: number,
  stepCost: (x: number, y: number, diagonal: boolean) => number,
): TilePoint[] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const diag = Math.min(Math.abs(dx), Math.abs(dy));
  const straight = Math.max(Math.abs(dx), Math.abs(dy)) - diag;
  const d: [number, number] = [Math.sign(dx), Math.sign(dy)];
  const s: [number, number] = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  const runs: [[number, number], number][] = diagonalFirst ? [[d, diag], [s, straight]] : [[s, straight], [d, diag]];
  // only the path's own last tile may be end-only
  const isEnd = (x: number, y: number) => x === last.x && y === last.y;
  const tiles: TilePoint[] = [];
  let x = a.x;
  let y = a.y;
  let cost = 0;
  for (const [[sx, sy], n] of runs) {
    for (let k = 0; k < n; k++) {
      if (!canStep(g, x, y, sx, sy, endOnly, isEnd)) return null;
      x += sx;
      y += sy;
      cost += stepCost(x, y, sx !== 0 && sy !== 0);
      if (cost > budget) return null;
      tiles.push({ x, y });
    }
  }
  return tiles;
}

/** Drops the tiles a straight line already covers, so a trail is drawn as a few long legs rather than tile by tile. */
export function simplifyPath(path: readonly TilePoint[]): TilePoint[] {
  if (path.length < 3) return path.slice();
  const out: TilePoint[] = [path[0]!];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = path[i]!;
    const c = path[i + 1]!;
    if ((b.x - a.x) * (c.y - b.y) !== (b.y - a.y) * (c.x - b.x)) out.push(b);
  }
  out.push(path[path.length - 1]!);
  return out;
}
