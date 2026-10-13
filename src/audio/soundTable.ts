import type { SynthRecipe } from './synth';

/**
 * The sounds the engine can play: synthesised recipes by name, plus the master share every sound plays at. Empty
 * until the game registers its own (`registerSounds`); the mapping from game happenings to sound names stays in
 * the game.
 */
export interface SoundTable {
  /** Share of the effects volume everything plays at: keeps full volume modest next to the music. */
  master: number;
  recipes: Record<string, SynthRecipe>;
}

export const SOUNDS: SoundTable = { master: 1, recipes: {} };

export function registerSounds(table: Partial<SoundTable>): void {
  if (table.master !== undefined) SOUNDS.master = table.master;
  if (table.recipes) Object.assign(SOUNDS.recipes, table.recipes);
}
