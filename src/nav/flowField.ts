import { MinHeap } from './MinHeap';
import { canStep, isOpen, NAV_STEPS, type NavGrid, type NavOptions, type TilePoint } from './navGrid';

/**
 * Which way to step from every tile to reach the nearest goal: one search for a whole crowd. A hundred monsters
 * chasing one player cost one flow field a re-plan, where a hundred `findPath`s would cost a hundred searches.
 */
export interface FlowField {
  readonly width: number;
  readonly height: number;
  /** Walking cost from each tile (row-major) to its nearest goal, `Infinity` where none can be reached. */
  readonly costs: Float32Array;
  /** The step to take from each tile, an index into `NAV_STEPS`; -1 on a goal and where nothing is reached. */
  readonly steps: Int8Array;
  /** The step from tile (tx, ty) as [dx, dy], or null on a goal, a wall, outside the grid or out of reach. */
  stepAt(tx: number, ty: number): readonly [number, number] | null;
  /** The cost from (tx, ty) to its nearest goal (`Infinity` out of reach or outside the grid). */
  costAt(tx: number, ty: number): number;
}

/**
 * A flow field towards `goals` (any number: every door out of a burning house), by the same steps, corner rules,
 * costs and end-only tiles `findPath` takes, so a body following it walks the route `findPath` would have found.
 * `maxCost` stops the spread (bodies further off stand still or wander).
 */
export function flowField(g: NavGrid, goals: readonly TilePoint[], options: NavOptions & { maxCost?: number } = {}): FlowField {
  const { cost, endOnly, maxCost = Infinity } = options;
  const W = g.width;
  const n = W * g.height;
  const costs = new Float32Array(n).fill(Infinity);
  const steps = new Int8Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  const isGoal = new Uint8Array(n);
  for (const p of goals) {
    if (!isOpen(g, p.x, p.y)) continue;
    const i = p.y * W + p.x;
    isGoal[i] = 1;
    costs[i] = 0;
    heap.push(i, 0);
  }
  const goalTest = (x: number, y: number) => isGoal[y * W + x] === 1;
  while (heap.size > 0) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    const cx = i % W;
    const cy = (i / W) | 0;
    // nothing is reached through an end-only tile that is not a goal
    if (!isGoal[i] && endOnly?.(cx, cy)) continue;
    for (let s = 0; s < NAV_STEPS.length; s++) {
      const [dx, dy, len] = NAV_STEPS[s]!;
      // the body stands on (nx, ny) and steps back onto (cx, cy): that step must be legal
      const nx = cx - dx;
      const ny = cy - dy;
      if (!isOpen(g, nx, ny)) continue;
      if (!canStep(g, nx, ny, dx, dy, endOnly, goalTest)) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      const c = costs[i]! + len + (cost ? cost(cx, cy) : 0);
      if (c >= costs[ni]! || c > maxCost) continue;
      costs[ni] = c;
      steps[ni] = s;
      heap.push(ni, c);
    }
  }
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < g.height;
  return {
    width: W,
    height: g.height,
    costs,
    steps,
    stepAt(tx, ty) {
      if (!inside(tx, ty)) return null;
      const s = steps[ty * W + tx]!;
      if (s < 0) return null;
      const step = NAV_STEPS[s]!;
      return [step[0], step[1]];
    },
    costAt(tx, ty) {
      return inside(tx, ty) ? costs[ty * W + tx]! : Infinity;
    },
  };
}

/**
 * The tiles a body at `from` walks by following the field, to the goal (both ends included), or null when `from` is
 * out of reach. For drawing the route, and for tests; a body steps one tile at a time with `stepAt`.
 */
export function followField(field: FlowField, from: TilePoint, maxSteps = field.width * field.height): TilePoint[] | null {
  if (field.costAt(from.x, from.y) === Infinity) return null;
  const out: TilePoint[] = [{ x: from.x, y: from.y }];
  let x = from.x;
  let y = from.y;
  for (let k = 0; k < maxSteps; k++) {
    const s = field.stepAt(x, y);
    if (!s) return out;
    x += s[0];
    y += s[1];
    out.push({ x, y });
  }
  return out;
}
