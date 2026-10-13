/*
 * Short-lived light: what a fight throws into the dark — a fireball or a bolt in flight, a blast,
 * a blow landing. The map's own darkness (`Darkness`: the underground, a cave, the outdoor night) cuts each
 * one out of its sheet like a lamp, so a spell lights the corridor it flies down. Looks only, client-only; one list
 * for the whole client, since only one map is ever drawn. `engineSettings.combatLights` turns them off, and so does
 * `engineSettings.batterySaver`: the list still keeps time, but nothing reads it, so the dark stays as the map's lamps leave it.
 */

import { engineSettings } from '../settings';

export interface TransientLight {
  x: number;
  y: number;
  /** Radius at its brightest, world px. */
  r: number;
  born: number;
  /** When it is gone; a carried light's is pushed to `CARRIED_MAX_MS` and brought in by its `end()`. */
  until: number;
  /** A light riding a moving thing reads its place every frame. */
  follow?: () => { x: number; y: number };
  /** A flash shrinks as it goes out; a carried light keeps its size. */
  fades: boolean;
  /** The colour it lays on what it lights: a fireball's orange, a spell's violet, a blade's white. */
  color: number;
}

/** A light nobody named a colour for: the pale gold of a spark. */
const SPARK = 0xfff0c8;

const LIGHTS: TransientLight[] = [];
/** More than this at once adds nothing a player can see, and each is a sprite in the night's redraw. */
const MAX_LIGHTS = 48;

/** A flash at (x, y) in `color`: `r` px at once, shrinking to nothing over `ms`. */
export function flashLight(x: number, y: number, r: number, ms: number, color = SPARK, now = performance.now()): void {
  if (LIGHTS.length >= MAX_LIGHTS) LIGHTS.shift();
  LIGHTS.push({ x, y, r, born: now, until: now + ms, fades: true, color });
}

/** The longest a carried light burns when nothing ends it: no shot flies, nor any spell is held, that long. */
const CARRIED_MAX_MS = 20_000;

/** A light that rides `at` until `end()` is called (a shot in flight), and never past `CARRIED_MAX_MS`. */
export function carriedLight(at: () => { x: number; y: number }, r: number, color = SPARK, now = performance.now()): { end: () => void } {
  const p = at();
  const light: TransientLight = { x: p.x, y: p.y, r, born: now, until: now + CARRIED_MAX_MS, follow: at, fades: false, color };
  if (LIGHTS.length >= MAX_LIGHTS) LIGHTS.shift();
  LIGHTS.push(light);
  return { end: () => (light.until = 0) };
}

const NONE: readonly TransientLight[] = [];

/** The lights burning at `now`, each with its radius then; spent ones are dropped. None while combat lights are off. */
export function liveLights(now: number): readonly TransientLight[] {
  for (let i = LIGHTS.length - 1; i >= 0; i--) if (LIGHTS[i]!.until <= now) LIGHTS.splice(i, 1);
  const settings = engineSettings.getState();
  // the battery saver puts the transient lights out too: each one redraws the night
  if (settings.combatLights === false || settings.batterySaver) return NONE;
  for (const l of LIGHTS) {
    if (!l.follow) continue;
    // a light whose rider has gone is put out, never left to throw in every frame's night
    let p: { x: number; y: number };
    try {
      p = l.follow();
    } catch {
      l.until = 0;
      l.follow = undefined;
      continue;
    }
    l.x = p.x;
    l.y = p.y;
  }
  return LIGHTS;
}

/** The radius `l` burns at `now`: a flash eases out from its full size, a carried light holds it. */
export function lightRadius(l: TransientLight, now: number): number {
  if (!l.fades) return l.r;
  const t = Math.min(1, (now - l.born) / Math.max(1, l.until - l.born));
  return l.r * Math.sqrt(1 - t);
}

/** A new map: nothing of the last one's fight is left burning. */
export function clearLights(): void {
  LIGHTS.length = 0;
}
