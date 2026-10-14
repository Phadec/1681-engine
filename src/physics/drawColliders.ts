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

/** Draws one line in world coordinates (`DebugOverlay`'s `LineDrawer`). */
export type ColliderLineDrawer = (x0: number, y0: number, x1: number, y1: number, color?: number) => void;

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
 * Given `line` (the overlay hands it over as its second argument), a turned box or a polygon is drawn as its own
 * outline, and a circle that rotates gets a spoke showing its angle.
 *
 * ```ts
 * new DebugOverlay(engine, { colliders: (draw, line) => drawColliders(physics, draw, {}, undefined, line) });
 * ```
 */
export function drawColliders(
  world: PhysicsWorld,
  draw: ColliderBoxDrawer,
  colors: Partial<ColliderColors> = {},
  colorOf?: (body: Body) => number | undefined,
  line?: ColliderLineDrawer,
): void {
  const c = { ...COLLIDER_COLORS, ...colors };
  for (const b of world.bodies) {
    const color = colorOf?.(b) ?? colliderColor(b, c);
    if (line && b.corners > 0 && !b.axisAligned) {
      for (let i = 0; i < b.corners; i++) {
        const j = (i + 1) % b.corners;
        line(b.wx[i]!, b.wy[i]!, b.wx[j]!, b.wy[j]!, color);
      }
      continue;
    }
    draw(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY, color);
    if (line && b.shape.kind === 'circle' && b.rotates) line(b.x, b.y, b.x + b.cos * b.shape.radius, b.y + b.sin * b.shape.radius, color);
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
