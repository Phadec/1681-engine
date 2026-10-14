import {
  BODY_HALF_HEIGHT,
  BODY_HALF_WIDTH,
  COLLISION_EPSILON,
  INPUT_FLAG_DASH,
  INPUT_STEP_DT,
  type InputStep,
  type MovementParams,
} from './constants';

/*
 * Deterministic player movement simulation.
 *
 * The server runs this exact algorithm (or a port of it) as the authority;
 * the client runs it for prediction and replays unacknowledged steps after every snapshot.
 * Keep the operation order identical on both sides so floating point results match bit for bit.
 */

/** 1/sqrt(2), written as a literal so every port uses the exact same double. */
export const DIAGONAL = 0.7071067811865476;

export interface CollisionGrid {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  /** 1 = solid, row-major. */
  readonly solid: Uint8Array;
  /** 1 = a solid tile a shot flies over (`shotOverTiles`), row-major; absent when the ground was not given. */
  readonly shotOver?: Uint8Array;
  /** Half the moving body's collision box, px. */
  readonly bodyHalfWidth: number;
  readonly bodyHalfHeight: number;
}

export interface CollisionGridOptions {
  /** The tile id of every cell, row-major; needed only for `shotOverTiles`. */
  ground?: readonly number[];
  /** Tile ids nothing walks but a shot flies over (water, lava…): solid for bodies, open for shots. */
  shotOverTiles?: Iterable<number>;
  /** Half the moving body's collision box, px (default `BODY_HALF_WIDTH` × `BODY_HALF_HEIGHT`, a 10×6 foot box). */
  bodyHalfWidth?: number;
  bodyHalfHeight?: number;
}

export interface MoverState {
  x: number;
  y: number;
  /** Last non-zero movement direction (normalized), used for dashing while idle. */
  lastDx: number;
  lastDy: number;
  dashLeft: number;
  dashCd: number;
  dashDx: number;
  dashDy: number;
}

/** A grid from a string of '0'/'1' per cell (row-major, '1' solid). */
export function createCollisionGrid(width: number, height: number, tileSize: number, solid: string, options: CollisionGridOptions = {}): CollisionGrid {
  if (solid.length !== width * height) {
    throw new Error(`collision string length ${solid.length} != ${width}x${height}`);
  }
  const bytes = new Uint8Array(width * height);
  for (let i = 0; i < bytes.length; i++) bytes[i] = solid.charCodeAt(i) === 49 ? 1 : 0;
  const { ground } = options;
  const over = new Set(options.shotOverTiles ?? []);
  let shotOver: Uint8Array | undefined;
  if (ground && ground.length === bytes.length && over.size) {
    shotOver = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) shotOver[i] = bytes[i] && over.has(ground[i]!) ? 1 : 0;
  }
  const bodyHalfWidth = options.bodyHalfWidth ?? BODY_HALF_WIDTH;
  const bodyHalfHeight = options.bodyHalfHeight ?? BODY_HALF_HEIGHT;
  return shotOver ? { width, height, tileSize, solid: bytes, shotOver, bodyHalfWidth, bodyHalfHeight } : { width, height, tileSize, solid: bytes, bodyHalfWidth, bodyHalfHeight };
}

/** Whether a shot in flight stops on this tile: solid, and not ground a shot flies over (`shotOverTiles`). */
export function blocksShot(grid: CollisionGrid, tx: number, ty: number): boolean {
  if (!isSolidTile(grid, tx, ty)) return false;
  return grid.shotOver?.[ty * grid.width + tx] !== 1;
}

export function createMover(x: number, y: number): MoverState {
  return { x, y, lastDx: 1, lastDy: 0, dashLeft: 0, dashCd: 0, dashDx: 1, dashDy: 0 };
}

export function isSolidTile(grid: CollisionGrid, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) return true;
  return grid.solid[ty * grid.width + tx] === 1;
}

/** True if the body box centered at (x, y) overlaps a solid tile. */
export function bodyCollides(grid: CollisionGrid, x: number, y: number): boolean {
  const ts = grid.tileSize;
  const x0 = Math.floor((x - grid.bodyHalfWidth) / ts);
  const x1 = Math.floor((x + grid.bodyHalfWidth) / ts);
  const y0 = Math.floor((y - grid.bodyHalfHeight) / ts);
  const y1 = Math.floor((y + grid.bodyHalfHeight) / ts);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (isSolidTile(grid, tx, ty)) return true;
    }
  }
  return false;
}

/** Moves along X by dx, stopping flush against the first solid tile column. */
export function moveX(grid: CollisionGrid, x: number, y: number, dx: number): number {
  if (dx === 0) return x;
  const ts = grid.tileSize;
  const nx = x + dx;
  const y0 = Math.floor((y - grid.bodyHalfHeight) / ts);
  const y1 = Math.floor((y + grid.bodyHalfHeight) / ts);
  if (dx > 0) {
    const tx = Math.floor((nx + grid.bodyHalfWidth) / ts);
    for (let ty = y0; ty <= y1; ty++) {
      if (isSolidTile(grid, tx, ty)) return tx * ts - grid.bodyHalfWidth - COLLISION_EPSILON;
    }
  } else {
    const tx = Math.floor((nx - grid.bodyHalfWidth) / ts);
    for (let ty = y0; ty <= y1; ty++) {
      if (isSolidTile(grid, tx, ty)) return (tx + 1) * ts + grid.bodyHalfWidth + COLLISION_EPSILON;
    }
  }
  return nx;
}

/** Moves along Y by dy, stopping flush against the first solid tile row. */
export function moveY(grid: CollisionGrid, x: number, y: number, dy: number): number {
  if (dy === 0) return y;
  const ts = grid.tileSize;
  const ny = y + dy;
  const x0 = Math.floor((x - grid.bodyHalfWidth) / ts);
  const x1 = Math.floor((x + grid.bodyHalfWidth) / ts);
  if (dy > 0) {
    const ty = Math.floor((ny + grid.bodyHalfHeight) / ts);
    for (let tx = x0; tx <= x1; tx++) {
      if (isSolidTile(grid, tx, ty)) return ty * ts - grid.bodyHalfHeight - COLLISION_EPSILON;
    }
  } else {
    const ty = Math.floor((ny - grid.bodyHalfHeight) / ts);
    for (let tx = x0; tx <= x1; tx++) {
      if (isSolidTile(grid, tx, ty)) return (ty + 1) * ts + grid.bodyHalfHeight + COLLISION_EPSILON;
    }
  }
  return ny;
}

function clampAxis(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** Advances the mover by one fixed input step. Mutates `s`. */
export function stepMover(s: MoverState, step: InputStep, p: MovementParams, grid: CollisionGrid): void {
  if (s.dashCd > 0) s.dashCd--;

  // A dodge roll is committed: while it runs, input neither steers it nor aims the next one.
  const rolling = s.dashLeft > 0;
  let mx = p.canMove && !rolling ? clampAxis(step[0]) : 0;
  let my = p.canMove && !rolling ? clampAxis(step[1]) : 0;
  if (mx !== 0 && my !== 0) {
    mx = mx * DIAGONAL;
    my = my * DIAGONAL;
  }
  if (mx !== 0 || my !== 0) {
    s.lastDx = mx;
    s.lastDy = my;
  }

  if ((step[2] & (p.dashFlag ?? INPUT_FLAG_DASH)) !== 0 && p.canDash && p.canMove && s.dashLeft === 0 && s.dashCd === 0) {
    s.dashLeft = p.dashSteps;
    s.dashCd = p.dashCooldownSteps;
    s.dashDx = s.lastDx;
    s.dashDy = s.lastDy;
  }

  let vx: number;
  let vy: number;
  if (s.dashLeft > 0) {
    vx = s.dashDx * p.dashSpeed;
    vy = s.dashDy * p.dashSpeed;
    s.dashLeft--;
  } else {
    vx = mx * p.speed;
    vy = my * p.speed;
  }

  const dt = p.stepDt ?? INPUT_STEP_DT;
  s.x = moveX(grid, s.x, s.y, vx * dt);
  s.y = moveY(grid, s.x, s.y, vy * dt);
}
