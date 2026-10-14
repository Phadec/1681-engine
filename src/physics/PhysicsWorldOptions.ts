import type { SolverSettings } from './ContactSolver';

/** Tuning for a `PhysicsWorld`; every field has a default fit for a platformer in pixels. */
export interface PhysicsWorldOptions extends Partial<SolverSettings> {
  /** Px/s² (default 0, 980: y grows downwards, so positive y falls). */
  gravityX?: number;
  gravityY?: number;
  /** Broad-phase cell size, px (default 64): about the size of a typical body or a few tiles. */
  cellSize?: number;
  velocityIterations?: number;
  positionIterations?: number;
  /** A step is split so no body moves more than its own smallest half size per sub-step, up to this many (default 16). */
  maxSubsteps?: number;
  /** No body moves faster than this, px/s (default 4000): the bound that makes the sub-steps above enough. */
  maxSpeed?: number;
  /** Gap (px) at which a pair already counts as touching (default 0.5). */
  contactMargin?: number;
  /** A contact normal with an upward share above this grounds a body (default 0.7, ground up to ~45°). */
  groundNormal?: number;
  /** Let bodies at rest stop being simulated until something touches them (default false). */
  allowSleep?: boolean;
  sleepSpeed?: number;
  sleepTime?: number;
}
