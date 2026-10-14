# Navigation

Path finding on tile grids: A* `findPath` with a reach radius, extra costs and end-only tiles; `straightenPath` to
iron out its staircases; `floodFill` for walking distance to every tile; `nearestOpen` for a start or goal that landed
in a wall. All of it is pure (no Pixi, no DOM), so it runs on a server and under node in tests.

## A path across a map

```ts
import { collisionFromTiled, findPath, navGridFromCollision, simplifyPath, straightenPath, type TilePoint } from '1681-engine';

const grid = navGridFromCollision(collisionFromTiled(tiled)); // or navGrid(w, h, (tx, ty) => walkable)
const from: TilePoint = { x: Math.floor(hero.x / 16), y: Math.floor(hero.y / 16) };

const path = findPath(grid, from, { x: 40, y: 12, reach: 1 }); // tiles from start to goal, or null
if (path) {
  const route = straightenPath(grid, path); // fewer turns, never dearer
  const legs = simplifyPath(route); // only the corners, for drawing a trail
  walkAlong(route.map((t) => ({ x: t.x * 16 + 8, y: t.y * 16 + 8 })));
}
```

A `NavGrid` is a width, a height and `walkable(tx, ty)`, which is never asked about a tile outside the grid.
`navGridFromCollision` reads the engine's `CollisionGrid`, so a Tiled map's collision layer is the walkable ground.
Steps are eight-way, diagonals cost √2, and a diagonal never cuts the corner between two walls.

## Goals

- `{ x, y }`: that tile only.
- `{ x, y, reach }`: anywhere within `reach` tiles of it, centre to centre. Prefer this: aiming at an exact tile sent
  auto-walks into a spot inside a hut, shuffling against its wall a step from where they were already close enough.
- `{ test, estimate }`: tiles of your own (any tile next to a chest, the nearest exit). `estimate` must never be more
  than the real remaining cost; leave it out and the search is a plain Dijkstra.

A start on a wall is moved to the nearest open tile first. `maxNodes` (14,000) caps the tiles settled before giving
up, so a goal walled off on a big map cannot stall a frame.

## Costs and end-only tiles

```ts
import { findPath, nearWallCost, straightenPath } from '1681-engine';

const options = {
  cost: nearWallCost(grid), // +1.4 next to a wall: keep to the middle of a clearing
  endOnly: (tx: number, ty: number) => isDoor(tx, ty), // a door, a trap, a ledge: may end there, never pass through
};
const path = findPath(grid, from, goal, options);
const route = path && straightenPath(grid, path, options); // pass the same options
```

`cost` is added on top of each step and must not be negative, or A* stops being exact. `nearWallCost` is there because
the narrow way between two obstacles is where an auto-walking body wedges itself; 1.4 is high enough to go round a
thicket and low enough to still take a gate. `endOnly` tiles are never stepped through or brushed past diagonally: a
route along a road once dropped riders through a door into another map.

Always hand `straightenPath` the options the path was found with: it only swaps a stretch for one that costs no more
by the same `cost` and touches no end-only tile short of the end.

## Distances: `floodFill`

```ts
import { floodFill, reachedCount } from '1681-engine';

const costs = floodFill(grid, from, { maxCost: 60 }); // row-major, Infinity where unreachable
const nearest = chests.reduce((a, b) => (costs[b.ty * grid.width + b.tx]! < costs[a.ty * grid.width + a.tx]! ? b : a));
```

Weigh several destinations by real walking distance rather than a straight line. `reachedCount(costs)` is a quick
check that a change to the ground walled nothing off: run it from the spawn in a test after editing a map.

## A start inside a rock

`nearestOpen(grid, tx, ty, maxRadius = 12, ok?)` finds the closest open tile, ring by ring (the closest on each ring,
not the first scanned), or null. `ok` narrows what counts: an open tile that is not a door, say.

## Pitfalls

- Re-solve rather than following a stale path: a door that closed or a body that moved is not in a path found a
  second ago. A path costs little on a small map; on a big one, re-solve every few steps, not every frame.
- Tile paths are tile centres. A body wider than a tile needs a grid where `walkable` already accounts for its size.
- `MinHeap` is the search's own priority queue, exported for a search of your own.

## API

[`findPath`](/api/index/functions/findPath) · [`NavGoal`](/api/index/type-aliases/NavGoal) ·
[`navGrid`](/api/index/functions/navGrid) · [`navGridFromCollision`](/api/index/functions/navGridFromCollision) ·
[`straightenPath`](/api/index/functions/straightenPath) · [`simplifyPath`](/api/index/functions/simplifyPath) ·
[`floodFill`](/api/index/functions/floodFill) · [`nearestOpen`](/api/index/functions/nearestOpen) ·
[`nearWallCost`](/api/index/functions/nearWallCost)
