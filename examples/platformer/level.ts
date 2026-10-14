/*
 * The level, written by hand: one character a 16-px tile, two screens wide. Reading it is the whole level format —
 * a real game would load a Tiled map instead (see the top-down example); this keeps the example free of assets.
 *
 *   #  solid ground          -  one-way plank (jump up through it, stand on it)
 *   o  coin                  c  crate (pushable)
 *   =  moving platform       P  where the hero starts
 *   F  goal flag
 */
export const TILE = 16;

const ROWS = [
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#...........oo..............oo.........#',
  '#..........----....o.......----......F.#',
  '#...................................####',
  '#...o...........=.........c.....o.######',
  '#.P...c..######.........o.c.....########',
  '################.......#################',
  '################.......#################',
];

export const LEVEL_W = ROWS[0]!.length;
export const LEVEL_H = ROWS.length;
export const LEVEL_PX_W = LEVEL_W * TILE;
export const LEVEL_PX_H = LEVEL_H * TILE;

/** How far (tiles) the moving platform travels right of where it is drawn, and how wide it is. */
export const PLATFORM_TRAVEL = 4;
export const PLATFORM_TILES = 3;

export interface TilePos {
  tx: number;
  ty: number;
}

/** What the level holds, read once out of the rows. */
export interface LevelData {
  solid: (tx: number, ty: number) => boolean;
  oneWay: (tx: number, ty: number) => boolean;
  coins: TilePos[];
  crates: TilePos[];
  platforms: TilePos[];
  start: TilePos;
  goal: TilePos;
}

function charAt(tx: number, ty: number): string {
  return ROWS[ty]?.[tx] ?? '.';
}

export function readLevel(): LevelData {
  const found: Record<string, TilePos[]> = {};
  for (let ty = 0; ty < LEVEL_H; ty++) {
    for (let tx = 0; tx < LEVEL_W; tx++) {
      const c = charAt(tx, ty);
      if ('ocP=F'.includes(c)) (found[c] ??= []).push({ tx, ty });
    }
  }
  const one = (c: string): TilePos => {
    const p = found[c]?.[0];
    if (!p) throw new Error(`level: no '${c}'`);
    return p;
  };
  return {
    solid: (tx, ty) => charAt(tx, ty) === '#',
    oneWay: (tx, ty) => charAt(tx, ty) === '-',
    coins: found['o'] ?? [],
    crates: found['c'] ?? [],
    platforms: found['='] ?? [],
    start: one('P'),
    goal: one('F'),
  };
}
