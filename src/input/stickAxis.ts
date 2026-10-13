/**
 * The virtual joystick's arithmetic, kept pure so it can be tested. The stick hands the game the **same** axis
 * the keyboard does — `stepMover` clamps every step to -1/0/1 on each axis (movement is eight-way, and the server
 * reads it the same way), so an analog stick would only be rounded there anyway. The rounding happens here instead,
 * by eight 45° sectors, so a thumb held a little off the horizontal walks straight rather than flickering between
 * east and north-east.
 */

/** Below this share of the stick's radius the thumb is resting: no movement, and the aim falls back (touchAim.ts). */
export const STICK_DEAD_ZONE = 0.28;

export interface StickVector {
  x: number;
  y: number;
}

/** The thumb's offset from where the stick was planted, as a vector of length at most 1 (radius = full tilt). */
export function stickVector(dx: number, dy: number, radius: number): StickVector {
  if (radius <= 0) return { x: 0, y: 0 };
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };
  const k = len > radius ? 1 / len : 1 / radius;
  return { x: dx * k, y: dy * k };
}

/** True when the stick is tilted past the dead zone. */
export function stickActive(v: StickVector, deadZone = STICK_DEAD_ZONE): boolean {
  return Math.hypot(v.x, v.y) >= deadZone;
}

/**
 * The keyboard-shaped axis for a stick vector: each of dx, dy is -1, 0 or 1 (screen y grows downward, as the
 * keyboard's "down" does), nothing inside the dead zone, and the nearest of the eight directions otherwise.
 */
export function stickToAxis(v: StickVector, deadZone = STICK_DEAD_ZONE): { dx: number; dy: number } {
  if (!stickActive(v, deadZone)) return { dx: 0, dy: 0 };
  const sector = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4));
  const angle = sector * (Math.PI / 4);
  const round = (n: number) => (Math.abs(n) < 1e-9 ? 0 : Math.sign(n));
  return { dx: round(Math.cos(angle)), dy: round(Math.sin(angle)) };
}
