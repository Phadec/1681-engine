/**
 * A fixed-timestep accumulator: frames arrive whenever the display wants them, the simulation advances in equal
 * steps. Movement and anything a server replays must run here, so every machine takes the same steps whatever its
 * frame rate.
 *
 * A frame that comes very late (a tab in the background, a debugger) would owe hundreds of steps; at most
 * `maxStepsPerFrame` are run and the rest of the debt is dropped, so the game slows down instead of freezing while it
 * catches up (the "spiral of death").
 */
export interface FixedLoopOptions {
  /** Steps per second (default 60). */
  hz?: number;
  /** The most steps one frame may run before the debt is dropped (default 8). */
  maxStepsPerFrame?: number;
}

export class FixedLoop {
  readonly stepMs: number;
  readonly stepSeconds: number;
  private readonly maxSteps: number;
  private carry = 0;
  /** Steps taken since the loop started. */
  tick = 0;

  constructor(options: FixedLoopOptions = {}) {
    const hz = options.hz ?? 60;
    if (!(hz > 0)) throw new Error(`FixedLoop: hz must be positive, got ${hz}`);
    this.stepMs = 1000 / hz;
    this.stepSeconds = 1 / hz;
    this.maxSteps = Math.max(1, options.maxStepsPerFrame ?? 8);
  }

  /**
   * Feeds one frame of `deltaMs` and runs `step` as many times as it owes. Returns the share of a step left over
   * (0–1), for interpolating what is drawn between the last two steps.
   */
  advance(deltaMs: number, step: (tick: number) => void): number {
    if (deltaMs > 0 && Number.isFinite(deltaMs)) this.carry += deltaMs;
    let ran = 0;
    while (this.carry >= this.stepMs) {
      if (ran === this.maxSteps) {
        this.carry %= this.stepMs;
        break;
      }
      this.carry -= this.stepMs;
      ran++;
      step(this.tick++);
    }
    return this.carry / this.stepMs;
  }

  /** Forgets any debt, e.g. after a scene change or a long load. */
  reset(): void {
    this.carry = 0;
  }
}
