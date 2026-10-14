/**
 * A bar's two lengths: what it holds now (`value`) and the trail behind it (`trail`) that drains down to it after a
 * short hold, so a hit shows how much it took. Fractions 0–1. Mutated in place: a health bar is set every frame.
 */
export interface DrainState {
  value: number;
  trail: number;
  /** What is left of the hold before the trail starts to drain (ms). */
  holdMs: number;
}

export interface DrainOptions {
  /** How long the trail holds after a loss before draining (default 400 ms). */
  delayMs?: number;
  /** How fast it drains, in whole bars a second (default 0.6). */
  rate?: number;
}

export function drainState(value = 1): DrainState {
  return { value, trail: value, holdMs: 0 };
}

/**
 * Sets the bar. A loss restarts the hold, so blows in quick succession show one trail for all of them; a gain fills
 * at once and pulls the trail up with it (a heal has nothing to show behind it).
 */
export function setDrainValue(state: DrainState, value: number, options: DrainOptions = {}): void {
  const v = value < 0 ? 0 : value > 1 ? 1 : value;
  if (v < state.value) state.holdMs = options.delayMs ?? 400;
  if (v > state.trail) state.trail = v;
  state.value = v;
}

/** Advances the trail by a frame `dtMs` long. */
export function stepDrain(state: DrainState, dtMs: number, options: DrainOptions = {}): void {
  if (state.trail <= state.value) {
    state.trail = state.value;
    return;
  }
  let dt = dtMs;
  if (state.holdMs > 0) {
    const used = Math.min(state.holdMs, dt);
    state.holdMs -= used;
    dt -= used;
  }
  if (dt <= 0) return;
  state.trail = Math.max(state.value, state.trail - ((options.rate ?? 0.6) * dt) / 1000);
}
