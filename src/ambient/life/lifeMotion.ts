import type { ViewRect } from '../../core/Camera';

/*
 * The pure rules the ambient life (`Drift`, `Birds`, `Butterflies`, `Fireflies`, `ChimneySmoke`) moves by, kept apart
 * from the sprites so they are tested under node. Nothing here reads a clock or `Math.random` of its own: time and
 * randomness are handed in.
 */

/** A point in world pixels. */
export interface LifePoint {
  x: number;
  y: number;
}

/** A box in world pixels (a canopy leaves fall from, a tile ash lifts off); a point is a box of no size. */
export interface LifeBox extends LifePoint {
  w?: number;
  h?: number;
}

/** The air the life reads: how dark it is and how hard the wind blows. */
export interface LifeAir {
  /** 0 by day, 1 at full night (birds and butterflies keep away from the dark, fireflies come out of it). */
  night: number;
  /** 0 still air, 1 a gale: leans the drift, hastens a flock, bends smoke. */
  wind: number;
}

/** Hands back somewhere to be: inside the camera's view, or null when there is nowhere there now. */
export type LifeSource<T extends LifeBox = LifeBox> = (view: ViewRect, random: () => number) => T | null;

/** Whether the box touches the view grown by `margin` on every side. */
export function boxInView(b: LifeBox, view: ViewRect, margin = 0): boolean {
  return b.x + (b.w ?? 0) >= view.x - margin && b.x <= view.right + margin && b.y + (b.h ?? 0) >= view.y - margin && b.y <= view.bottom + margin;
}

/**
 * One of `items` in view, tried `tries` times at random rather than filtered: a forest's thousands of tiles cost the
 * same few reads as a hamlet's dozen, and a miss only means the body waits a frame to try again.
 */
export function pickInView<T extends LifeBox>(items: readonly T[], view: ViewRect, random: () => number, tries = 8): T | null {
  if (!items.length) return null;
  for (let i = 0; i < tries; i++) {
    const it = items[Math.floor(random() * items.length)]!;
    if (boxInView(it, view)) return it;
  }
  return null;
}

/** A `LifeSource` over a fixed list (flower beds, the water's edge, tiles of burnt ground). */
export function sourceOf<T extends LifeBox>(items: readonly T[], tries = 8): LifeSource<T> {
  return (view, random) => pickInView(items, view, random, tries);
}

/** A bird's frame: a few beats (0, 1, 0, 1, 0), then a glide on raised wings (0) for three, each bird on its clock. */
export function birdFrame(now: number, offset: number, beatMs = 110): 0 | 1 {
  const beat = Math.floor((now + offset) / beatMs) % 8;
  return beat < 5 ? ((beat % 2) as 0 | 1) : 0;
}

/**
 * Where the `i`-th bird of a flock flies behind the leader: a loose V trailing back along `dirX` (its sign), ranks
 * alternating side to side. `jitter` (0..1 each) loosens it so no two flocks are drawn alike.
 */
export function flockSlot(i: number, dirX: number, jitterX: number, jitterY: number): { dx: number; dy: number } {
  const rank = Math.ceil(i / 2);
  const side = i % 2 ? 1 : -1;
  return { dx: -Math.sign(dirX) * rank * (6 + jitterX * 3), dy: side * rank * (4 + jitterY * 2) };
}

/** A firefly's blink at `t` seconds: 0 dark most of the time, 2 a glow for a beat, 1 a dim pixel either side of it. */
export function fireflyGlow(t: number): 0 | 1 | 2 {
  const cycle = (((t * 0.45) % 1) + 1) % 1;
  return cycle < 0.18 ? 2 : cycle < 0.26 || cycle > 0.94 ? 1 : 0;
}

/** A firefly's slow wander about its home at `t` seconds: two sines across, one up and down. */
export function fireflyOffset(t: number): { dx: number; dy: number } {
  return { dx: Math.sin(t * 0.7) * 9 + Math.sin(t * 1.9) * 3, dy: Math.cos(t * 0.5) * 5 };
}

/** How many of a pool of `count` fireflies are out at `night`: none before 0.5, all by 0.85. */
export function firefliesOut(count: number, night: number): number {
  if (night < 0.5) return 0;
  return Math.round(count * Math.min(1, (night - 0.5) / 0.35));
}

export interface PuffMotion {
  /** World px a second it climbs. */
  rise: number;
  /** World px a second the wind leans it at full age. */
  drift: number;
}

/**
 * Where a puff of smoke is `sec` seconds after it left a chimney's mouth, `age` the share of its life gone: it climbs
 * straight out of the pot, then the wind takes it more the higher it gets. `seed` (0..1) gives each its own wobble.
 */
export function puffOffset(sec: number, age: number, seed: number, wind: number, m: PuffMotion): { dx: number; dy: number } {
  return {
    dx: (seed - 0.5) * 2 + m.drift * (0.25 + wind) * sec * age * 2 + Math.sin(sec * 1.3 + seed * 6) * 1.2,
    dy: -m.rise * sec * (1 - age * 0.25),
  };
}
