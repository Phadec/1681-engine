import { createCollisionGrid, type MovementParams } from '../../src';

/*
 * What the server and every client must agree on, bit for bit: the map's collision and the movement rules. Both
 * import this file, so prediction replays land exactly where the server has the body.
 */

export const TILE = 16;
export const W = 40;
export const H = 26;

/** A courtyard: a wall round it and four pillars. */
export function courtyard(): string {
  let s = '';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wall = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      const pillar = [8, 31].includes(x) && [7, 18].includes(y);
      s += wall || pillar ? '1' : '0';
    }
  }
  return s;
}

export const GRID = createCollisionGrid(W, H, TILE, courtyard(), { bodyHalfWidth: 6, bodyHalfHeight: 4 });

export const PARAMS: MovementParams = { speed: 100, dashSpeed: 280, dashSteps: 10, dashCooldownSteps: 40, canMove: true, canDash: true };

export const PORT = 5181;

/** What a player says about themselves on joining. */
export interface PlayerInfo {
  name: string;
  color: number;
}
