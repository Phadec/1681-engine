import { sound } from './SoundEngine';

/** What a surface sounds like underfoot: a step, and a beat of hooves (a mount) if it differs. */
export interface SurfaceSounds {
  step: string;
  hoof?: string;
}

export interface FootstepOptions {
  /** Per surface name (`'grass'`, `'stone'`, `'wood'`…), the sounds a foot makes on it. */
  sounds: Record<string, SurfaceSounds>;
  /** The surface of anywhere `surfaceAt` does not name. */
  fallback: string;
  /** Weight of a step against other sounds (default 0.5). */
  gain?: number;
  /** Beyond this (world px) nobody else's steps are heard (default 200). */
  range?: number;
}

/**
 * Footsteps by the ground under the feet. The game says what a point is made of (`surfaceAt`: a tile's surface, a
 * Tiled property, a floor collider), and calls `step` on each beat of a walk or a gait; the sound is the surface's,
 * through `sound` at the feet, quieter and muffled with distance like every other sound, and dropped first when too
 * many sounds play at once.
 */
export class Footsteps {
  private surfaceAt: (x: number, y: number) => string | undefined = () => undefined;

  constructor(private readonly options: FootstepOptions) {}

  /** Where the surface of a world point comes from; `undefined` is the fallback surface. */
  setSurfaceAt(surfaceAt: (x: number, y: number) => string | undefined): void {
    this.surfaceAt = surfaceAt;
  }

  /** The surface at a world point. */
  surface(x: number, y: number): string {
    return this.surfaceAt(x, y) ?? this.options.fallback;
  }

  /** One step (or a beat of hooves when `mounted`) at the feet, world x/y; `local` is the player's own. */
  step(x: number, y: number, local: boolean, mounted = false): void {
    const o = this.options;
    const s = o.sounds[this.surface(x, y)] ?? o.sounds[o.fallback];
    if (!s) return;
    sound.play(mounted ? (s.hoof ?? s.step) : s.step, { x, y, local, gain: o.gain ?? 0.5, range: o.range ?? 200, minor: true });
  }
}
