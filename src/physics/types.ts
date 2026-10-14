import type { Body } from './Body';

/**
 * The shapes a body may have. Every shape is centred on the body's position and never rotates: a platformer's
 * bodies and most physics toys need no rotation, and leaving angular motion out keeps the solver small and its
 * stacks steady.
 *
 * Extension point: an oriented box or a convex polygon is a new `kind` here, a SAT test in `collide.ts`, an angle
 * and angular velocity on `Body`, and contact points (not only a normal) in `ContactSolver.ts`.
 */
export type Shape = CircleShape | BoxShape;

export interface CircleShape {
  readonly kind: 'circle';
  radius: number;
}

export interface BoxShape {
  readonly kind: 'box';
  halfWidth: number;
  halfHeight: number;
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
