import { MinHeap } from './MinHeap';
import { canStep, isOpen, NAV_STEPS, type NavGrid, type NavOptions, type TilePoint } from './navGrid';
import { nearestOpen } from './nearestOpen';

/**
 * Where a path ends. A point goal is met anywhere within `reach` tiles of its tile (centre to centre; 0 = that tile
 * only): aiming at an exact tile sent auto-walks into a spot inside a hut and left them shuffling against its wall a
 * step from where they were already close enough. A custom goal names its own tiles, with an `estimate` of the
 * tiles left that must never be more than the real cost (0, the default, makes the search a plain Dijkstra).
 */
export type NavGoal = { x: number; y: number; reach?: number } | { test: (tx: number, ty: number) => boolean; estimate?: (tx: number, ty: number) => number };

export interface FindPathOptions extends NavOptions {
  /** Tiles settled before giving up, so a goal walled off on a big map cannot stall a frame. */
  maxNodes?: number;
}

/** Octile distance: the cost of the cheapest eight-way walk over open ground. */
export function octile(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return ax + ay + (Math.SQRT2 - 2) * Math.min(ax, ay);
}

function goalOf(goal: NavGoal): { test: (x: number, y: number) => boolean; estimate: (x: number, y: number) => number } {
  if ('test' in goal) return { test: goal.test, estimate: goal.estimate ?? (() => 0) };
  const r = goal.reach ?? 0;
  return {
    test: (x, y) => Math.hypot(x - goal.x, y - goal.y) <= r + 1e-9,
    // less the goal's own radius: never more than the real remaining cost
    estimate: (x, y) => Math.max(0, octile(goal.x - x, goal.y - y) - r),
  };
}

/**
 * A* over the grid: the tiles from `from` to the goal, both included, or null when there is no way through. A start
 * on a wall is moved to the nearest open tile. The path is the cheapest by `cost`, but among equally cheap ones it
 * is whichever the heap settled on — often a staircase; `straightenPath` irons that out.
 */
export function findPath(g: NavGrid, from: TilePoint, to: NavGoal, options: FindPathOptions = {}): TilePoint[] | null {
  const { cost, endOnly, maxNodes = 14_000 } = options;
  const start = isOpen(g, from.x, from.y) ? from : nearestOpen(g, from.x, from.y);
  if (!start) return null;
  const goal = goalOf(to);
  if (goal.test(start.x, start.y)) return [{ x: start.x, y: start.y }];

  const W = g.width;
  const n = W * g.height;
  const best = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  const s = start.y * W + start.x;
  best[s] = 0;
  heap.push(s, goal.estimate(start.x, start.y));
  let visited = 0;
  while (heap.size > 0 && visited < maxNodes) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    visited++;
    const cx = i % W;
    const cy = (i / W) | 0;
    if (goal.test(cx, cy)) {
      const out: TilePoint[] = [];
      for (let k = i; k !== -1; k = cameFrom[k]!) out.push({ x: k % W, y: (k / W) | 0 });
      return out.reverse();
    }
    for (const [dx, dy, step] of NAV_STEPS) {
      if (!canStep(g, cx, cy, dx, dy, endOnly, goal.test)) continue;
      const nx = cx + dx;
      const ny = cy + dy;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      const tentative = best[i]! + step + (cost ? cost(nx, ny) : 0);
      if (tentative >= best[ni]!) continue;
      best[ni] = tentative;
      cameFrom[ni] = i;
      heap.push(ni, tentative + goal.estimate(nx, ny));
    }
  }
  return null;
}

/**
 * Walking cost from one tile to every tile of the grid (row-major, `Infinity` where unreachable), by the same steps
 * and costs `findPath` takes — for weighing several destinations by real distance rather than by a straight line. An
 * end-only tile gets a cost (it can be stepped onto) but nothing is reached through it. `maxCost` stops the spread.
 */
export function floodFill(g: NavGrid, from: TilePoint, options: NavOptions & { maxCost?: number } = {}): Float32Array {
  const { cost, endOnly, maxCost = Infinity } = options;
  const W = g.width;
  const n = W * g.height;
  const out = new Float32Array(n).fill(Infinity);
  const start = isOpen(g, from.x, from.y) ? from : nearestOpen(g, from.x, from.y);
  if (!start) return out;
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  const s = start.y * W + start.x;
  out[s] = 0;
  heap.push(s, 0);
  // every end-only tile counts as a goal here, so it is reached; the check below keeps it from being passed through
  const always = () => true;
  while (heap.size > 0) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    const cx = i % W;
    const cy = (i / W) | 0;
    if (i !== s && endOnly?.(cx, cy)) continue;
    for (const [dx, dy, step] of NAV_STEPS) {
      if (!canStep(g, cx, cy, dx, dy, endOnly, always)) continue;
      // a diagonal may still not brush past an end-only tile
      if (endOnly && dx !== 0 && dy !== 0 && (endOnly(cx + dx, cy) || endOnly(cx, cy + dy))) continue;
      const nx = cx + dx;
      const ny = cy + dy;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      const c = out[i]! + step + (cost ? cost(nx, ny) : 0);
      if (c >= out[ni]! || c > maxCost) continue;
      out[ni] = c;
      heap.push(ni, c);
    }
  }
  return out;
}

/** How many tiles a flood reached: a quick test that a change to the ground walled nothing off. */
export function reachedCount(costs: Float32Array): number {
  let n = 0;
  for (let i = 0; i < costs.length; i++) if (costs[i] !== Infinity) n++;
  return n;
}
