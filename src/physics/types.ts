import type { Body } from './Body';

/**
 * The shapes a body may have, each centred on the body's position. A body turns only when it is made with
 * `rotates: true`; a platformer's bodies need no rotation, and a body that never turns keeps the cheap axis-aligned
 * tests and the steadiest stacks.
 */
export type Shape = CircleShape | BoxShape | PolygonShape;

export interface CircleShape {
  readonly kind: 'circle';
  radius: number;
}

export interface BoxShape {
  readonly kind: 'box';
  halfWidth: number;
  halfHeight: number;
}

/** A point or a vector in world or body pixels, y down. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * A convex polygon, its vertices relative to the body's position, which must be the polygon's centroid (make one with
 * `polygonShape`, which orders the points and moves them there). Up to `MAX_POLYGON_VERTICES` corners.
 */
export interface PolygonShape {
  readonly kind: 'polygon';
  readonly vertices: readonly Vec2[];
}

/**
 * - `dynamic`: moved by gravity, forces and contacts;
 * - `static`: never moves (ground, walls); cheapest, kept in a broad phase of its own;
 * - `kinematic`: moved only by its velocity (a moving platform), pushes dynamic bodies and is never pushed.
 */
export type BodyType = 'dynamic' | 'static' | 'kinematic';

export interface BodyOptions {
  type?: BodyType;
  shape: Shape;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  /**
   * Whether contacts and torques turn the body (default false). A body that does not rotate may still be placed at an
   * `angle`, and keeps it.
   */
  rotates?: boolean;
  /** Radians, clockwise on screen (y grows downwards). */
  angle?: number;
  /** Radians per second. */
  angularVelocity?: number;
  /** Turning lost per second, as a share (default 0.05): a rolling ball slows down without rolling friction. */
  angularDamping?: number;
  /** Mass of a dynamic body (default 1). Ignored for static and kinematic bodies, whose mass is infinite. */
  mass?: number;
  /** Bounce, 0–1 (default 0). A pair bounces by the larger of its two. */
  restitution?: number;
  /** Coulomb friction coefficient (default 0.5). A pair uses the geometric mean of its two. */
  friction?: number;
  /** Velocity lost per second, as a share (default 0): air drag. */
  linearDamping?: number;
  /** Multiplies the world's gravity for this body (default 1; 0 floats). */
  gravityScale?: number;
  /** A sensor reports overlaps (contact events) but is never pushed and pushes nothing. */
  sensor?: boolean;
  /** Category bits this body is in (default 1). */
  layer?: number;
  /** Category bits this body collides with (default all). A pair collides when each one's layer is in the other's mask. */
  mask?: number;
  /** Anything the game wants to find again from a contact or a ray hit (an entity id, an object). */
  userData?: unknown;
}

/** Faces of a box that lie against more solid ground (bits), never used as a contact normal. */
export const FACE_LEFT = 1;
export const FACE_RIGHT = 2;
export const FACE_TOP = 4;
export const FACE_BOTTOM = 8;

/** A contact as events and queries report it. The normal points from `a` towards `b`; y grows downwards. */
export interface ContactInfo {
  readonly a: Body;
  readonly b: Body;
  readonly nx: number;
  readonly ny: number;
  /** Overlap along the normal, px (slightly negative while resting just apart). */
  readonly depth: number;
  /** Either body is a sensor: reported, never resolved. */
  readonly sensor: boolean;
  /** Where the two touch, world px: one or two points (two where an edge lies along an edge). */
  readonly points: readonly Vec2[];
}

export interface PhysicsEvents {
  /** Two bodies started touching (or a sensor started overlapping). Emitted after the step. */
  begin: ContactInfo;
  /** Two bodies stopped touching, or one of them was removed. Emitted after the step. */
  end: ContactInfo;
}

export interface RayHit {
  body: Body;
  /** Where the ray met the body. */
  x: number;
  y: number;
  /** Surface normal there, pointing back towards the ray's start. */
  nx: number;
  ny: number;
  /** Share of the ray's length at the hit, 0–1. */
  fraction: number;
}

export interface RaycastOptions {
  /** Only bodies whose layer shares a bit with this (default all). */
  mask?: number;
  /** Sensors are skipped unless this is true. */
  includeSensors?: boolean;
  /** Skip bodies this returns false for (the caster itself, say). */
  filter?: (body: Body) => boolean;
}
