import type { CollisionGrid } from '../net/movement';
import { Body } from './Body';
import { FACE_BOTTOM, FACE_LEFT, FACE_RIGHT, FACE_TOP } from './types';

export interface TileBodiesOptions {
  /** World position of tile (0, 0)'s top-left corner (default 0, 0). */
  originX?: number;
  originY?: number;
  friction?: number;
  restitution?: number;
  layer?: number;
  mask?: number;
  userData?: unknown;
}

/** A rectangle of solid tiles, in tiles, both ends inclusive. */
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Covers the solid cells of a tile grid with as few rectangles as a cheap greedy pass finds: runs along each row,
 * then a run is grown downwards while the row below has exactly the same run. A floor becomes one box and a wall
 * one tall box, so a body sliding along either crosses no seam to snag on.
 */
export function mergeTileRects(width: number, height: number, solid: (tx: number, ty: number) => boolean): TileRect[] {
  const done: TileRect[] = [];
  /** Rectangles still growing, by the run they end in ("x0,x1"). */
  let open = new Map<number, TileRect>();
  for (let ty = 0; ty < height; ty++) {
    const next = new Map<number, TileRect>();
    let tx = 0;
    while (tx < width) {
      if (!solid(tx, ty)) {
        tx++;
        continue;
      }
      const x0 = tx;
      while (tx < width && solid(tx, ty)) tx++;
      const x1 = tx - 1;
      const key = x0 * 0x100000 + x1;
      const above = open.get(key);
      if (above) {
        above.y1 = ty;
        open.delete(key);
        next.set(key, above);
      } else next.set(key, { x0, y0: ty, x1, y1: ty });
    }
    for (const r of open.values()) done.push(r);
    open = next;
  }
  for (const r of open.values()) done.push(r);
  return done;
}

/**
 * Static boxes for the solid tiles of a grid, ready for `PhysicsWorld.add`. Each box marks the faces that lie
 * wholly against more solid tiles as internal, so a body is never pushed out through a face that is inside the
 * ground (the seam between a floor and the wall standing on it).
 *
 * Outside the grid counts as open, so the edges of the map collide like any other face.
 */
export function tileBodies(width: number, height: number, tileSize: number, solid: (tx: number, ty: number) => boolean, options: TileBodiesOptions = {}): Body[] {
  const inside = (tx: number, ty: number): boolean => tx >= 0 && ty >= 0 && tx < width && ty < height && solid(tx, ty);
  const ox = options.originX ?? 0;
  const oy = options.originY ?? 0;
  return mergeTileRects(width, height, inside).map((r) => {
    const w = (r.x1 - r.x0 + 1) * tileSize;
    const h = (r.y1 - r.y0 + 1) * tileSize;
    const body = new Body({
      type: 'static',
      shape: { kind: 'box', halfWidth: w / 2, halfHeight: h / 2 },
      x: ox + r.x0 * tileSize + w / 2,
      y: oy + r.y0 * tileSize + h / 2,
      friction: options.friction,
      restitution: options.restitution,
      layer: options.layer,
      mask: options.mask,
      userData: options.userData,
    });
    let faces = 0;
    if (rowSolid(inside, r.x0, r.x1, r.y0 - 1)) faces |= FACE_TOP;
    if (rowSolid(inside, r.x0, r.x1, r.y1 + 1)) faces |= FACE_BOTTOM;
    if (columnSolid(inside, r.x0 - 1, r.y0, r.y1)) faces |= FACE_LEFT;
    if (columnSolid(inside, r.x1 + 1, r.y0, r.y1)) faces |= FACE_RIGHT;
    body.internalFaces = faces;
    return body;
  });
}

/** `tileBodies` for the engine's `CollisionGrid` (from `createCollisionGrid` or a Tiled map's `collisionFromTiled`). */
export function tileBodiesFromGrid(grid: CollisionGrid, options: TileBodiesOptions = {}): Body[] {
  return tileBodies(grid.width, grid.height, grid.tileSize, (tx, ty) => grid.solid[ty * grid.width + tx] === 1, options);
}

function rowSolid(solid: (tx: number, ty: number) => boolean, x0: number, x1: number, ty: number): boolean {
  for (let tx = x0; tx <= x1; tx++) if (!solid(tx, ty)) return false;
  return true;
}

function columnSolid(solid: (tx: number, ty: number) => boolean, tx: number, y0: number, y1: number): boolean {
  for (let ty = y0; ty <= y1; ty++) if (!solid(tx, ty)) return false;
  return true;
}
