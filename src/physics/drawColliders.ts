import type { Body } from './Body';
import type { PhysicsWorld } from './PhysicsWorld';

/** Colours `drawColliders` gives each kind of body. */
export interface ColliderColors {
  static: number;
  kinematic: number;
  /** A dynamic body standing on something. */
  grounded: number;
  /** A dynamic body in the air. */
  airborne: number;
  /** A dynamic body asleep (only with `allowSleep`). */
  sleeping: number;
  sensor: number;
}

export const COLLIDER_COLORS: Readonly<ColliderColors> = {
  static: 0x40ff60,
  kinematic: 0x40e0ff,
  grounded: 0xffff60,
  airborne: 0xff6060,
  sleeping: 0x808080,
  sensor: 0xff60e0,
};

/**
 * Draws one box in world coordinates. The same shape as `DebugOverlay`'s `BoxDrawer`, written out here so the physics
 * module stays free of anything that draws.
 */
export type ColliderBoxDrawer = (x: number, y: number, width: number, height: number, color?: number) => void;

/**
 * Draws every body's bounding box, coloured by what it is: the usual body of a `DebugOverlay`'s `colliders` callback,
 * which otherwise made every game keep a list of its own bodies just to show them.
 *
 * ```ts
 * new DebugOverlay(engine, { colliders: (draw) => drawColliders(physics, draw) });
 * ```
 *
 * `colorOf` picks a game's own colour for a body (a one-way plank, a hazard), or returns undefined for the default.
 * A circle is drawn as its bounding box: the overlay draws boxes, and a box round a circle still shows where it is.
 */
export function drawColliders(
  world: PhysicsWorld,
  draw: ColliderBoxDrawer,
  colors: Partial<ColliderColors> = {},
  colorOf?: (body: Body) => number | undefined,
): void {
  const c = { ...COLLIDER_COLORS, ...colors };
  for (const b of world.bodies) {
    const color = colorOf?.(b) ?? colliderColor(b, c);
    draw(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY, color);
  }
}

/** The default colour of one body. */
export function colliderColor(b: Body, c: ColliderColors = COLLIDER_COLORS): number {
  if (b.sensor) return c.sensor;
  if (b.type === 'static') return c.static;
  if (b.type === 'kinematic') return c.kinematic;
  if (!b.awake) return c.sleeping;
  return b.grounded ? c.grounded : c.airborne;
}
