/**
 * The movement defaults. Every one of them can be changed without forking: the tile size and the body's half extents
 * are fields of the `CollisionGrid` (`createCollisionGrid`'s `tileSize` and options), the dash bit and the step length
 * are optional fields of `MovementParams`. Client and server must agree on whichever numbers a game picks.
 */

/** The default tile size, px; a grid carries its own (`CollisionGrid.tileSize`). */
export const TILE_SIZE = 16;

/** The default fixed input steps a second (`MovementParams.stepDt` overrides the step's length). */
export const INPUT_STEP_RATE = 60;
export const INPUT_STEP_DT = 1 / INPUT_STEP_RATE;

/** The default bit of an input step's flags that asks for a dash (`MovementParams.dashFlag` overrides it). */
export const INPUT_FLAG_DASH = 1;

/** The default collision box, half extents (px); `createCollisionGrid`'s `bodyHalfWidth`/`bodyHalfHeight` override them. */
export const BODY_HALF_WIDTH = 5;
export const BODY_HALF_HEIGHT = 3;
export const COLLISION_EPSILON = 0.01;

/** One fixed input step: [axisX, axisY, flags]. */
export type InputStep = [number, number, number];

export interface MovementParams {
  speed: number;
  dashSpeed: number;
  dashSteps: number;
  dashCooldownSteps: number;
  canMove: boolean;
  canDash: boolean;
  /** The bit of an input step's flags that starts a dash (default `INPUT_FLAG_DASH`). */
  dashFlag?: number;
  /** Seconds one input step lasts (default `INPUT_STEP_DT`); speeds are px a second. */
  stepDt?: number;
}

/** One body's state in a snapshot: [id, x, y, aim, anim, hp, flags]. */
export type EntityUpdate = [number, number, number, number, number, number, number];
