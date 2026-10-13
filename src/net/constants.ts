/** World and movement constants. A game that needs other numbers forks these; client and server must agree. */

export const TILE_SIZE = 16;

/** Fixed input steps a second; movement is simulated per step on both sides. */
export const INPUT_STEP_RATE = 60;
export const INPUT_STEP_DT = 1 / INPUT_STEP_RATE;

/** Bit of an input step's flags that asks for a dodge roll. */
export const INPUT_FLAG_DASH = 1;

/** The body's collision box, half extents (px). */
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
}

/** One body's state in a snapshot: [id, x, y, aim, anim, hp, flags]. */
export type EntityUpdate = [number, number, number, number, number, number, number];
