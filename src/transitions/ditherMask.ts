/** The 4×4 ordered-dither (Bayer) matrix, thresholds 0–15 row by row. */
export const BAYER4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Dither levels from empty (0) to solid (16): a level n covers the n cells of the 4×4 tile with the lowest thresholds. */
export const DITHER_LEVELS = 16;

/** Whether cell (x, y) of a tiled 4×4 pattern is covered at `level` (0–16). */
export function ditherCovered(level: number, x: number, y: number): boolean {
  return BAYER4[(y & 3) * 4 + (x & 3)]! < level;
}

/**
 * The dither level of one band of a wipe. `progress` 0–1 runs the wipe; `position` 0–1 is the band's centre along
 * the direction of travel; `softness` (0–1) is how much of the screen the dithered edge spans. At progress 0 every
 * band is empty, at 1 every band is solid, and in between the edge sweeps across with its gradient in dither steps.
 */
export function wipeLevel(progress: number, position: number, softness: number): number {
  const soft = Math.max(1e-3, softness);
  const front = progress * (1 + soft);
  const local = (front - position) / soft;
  const k = local <= 0 ? 0 : local >= 1 ? 1 : local;
  return Math.round(k * DITHER_LEVELS);
}
