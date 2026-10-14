import { blob47Index, type AutotileRuleSet } from '../../src';

/*
 * The example's terrain and how it is tiled, shared by `make-assets.ts` (which bakes the LDtk file's auto-layer tiles)
 * and `main.ts` (which retiles a cell when it is clicked), so both draw the same tile for the same mask.
 */

export const TILE = 16;
export const FLOOR = 0;
export const WALL = 1;

/** The tileset's layout: the 47 blob wall tiles in `BLOB47_MASKS` order, then floors and decor. */
export const FLOOR_TILES = [47, 47, 47, 48];
export const FLOWER = 49;
export const COLUMNS = 8;
export const ROWS = 7;

export const RULES: AutotileRuleSet = {
  // a wall running off the map joins it, so the rooms' outer walls show no seam at the edge
  edge: 'same',
  rules: [
    { terrain: WALL, tiles: (mask) => blob47Index(mask) },
    // one entry for the full mask: every floor cell falls back to it, one of four variants by its position
    { terrain: FLOOR, mode: 'edges', tiles: { 15: FLOOR_TILES } },
  ],
};
