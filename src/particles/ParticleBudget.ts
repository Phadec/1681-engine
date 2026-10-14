import { engineSettings } from '../settings';

/**
 * Particles alive across every emitter that shares this budget. An emitter asks before it spawns and gives back as
 * its particles die, so a crowd of emitters at once costs no more than `limit`: ten explosions in one frame share the
 * budget instead of adding up to a frame the GPU cannot finish. Under reduced effects or the battery saver the limit
 * shrinks by `thinFactor`.
 */
export class ParticleBudget {
  private used = 0;

  constructor(
    /** Particles alive at once, for every emitter together. */
    public limit = 4000,
    /** The share of `limit` left under reduced effects or the battery saver. */
    public thinFactor = 0.35,
  ) {}

  /** The limit as the settings stand now. */
  get effectiveLimit(): number {
    const s = engineSettings.getState();
    return s.reducedFx || s.batterySaver ? Math.floor(this.limit * this.thinFactor) : this.limit;
  }

  get live(): number {
    return this.used;
  }

  /** Reserves up to `n` particles and returns how many were granted (0 when the budget is spent). */
  take(n: number): number {
    const granted = Math.max(0, Math.min(n, this.effectiveLimit - this.used));
    this.used += granted;
    return granted;
  }

  /** Returns `n` particles that died or were cleared. */
  give(n: number): void {
    this.used = Math.max(0, this.used - n);
  }
}

/** The budget every emitter shares unless it is handed its own. */
export const particleBudget = new ParticleBudget();
