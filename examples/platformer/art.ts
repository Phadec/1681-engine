import type { TextureRegistry } from '../../src';
import { PixelGrid, hash2, hex, makeSheet } from '../../src/pixel';
import { LEVEL_H, LEVEL_PX_H, LEVEL_PX_W, LEVEL_W, PLATFORM_TILES, TILE, type LevelData } from './level';

/*
 * Every sprite in the example, painted in code on PixelGrids and uploaded as sprite sheets: no image files, so the
 * example runs from a fresh clone with no network. Light comes from the upper left; every sprite gets a dark outline
 * so it reads against both the sky and the ground.
 */

export const HERO = { key: 'pf-hero', w: 14, h: 18 } as const;
export const HERO_FRAMES = { idle: 0, run: [1, 2, 3, 2], jump: 4, fall: 5 } as const;
export const COIN = { key: 'pf-coin', w: 10, h: 10, frames: 4 } as const;
export const CRATE = { key: 'pf-crate', w: 16, h: 16 } as const;
export const PLATFORM = { key: 'pf-platform', w: PLATFORM_TILES * TILE + 2, h: 10 } as const;
export const FLAG = { key: 'pf-flag', w: 18, h: 30, frames: 2 } as const;
export const GROUND = 'pf-ground';

const INK = hex('#1d1a2a');

/** The hero: a small courier in a mustard cap and a red scarf. `leg` is the stride (-1, 0, 1), `air` a jump pose. */
function heroFrame(leg: number, air: 'none' | 'up' | 'down'): PixelGrid {
  const g = new PixelGrid(HERO.w, HERO.h);
  const ox = 2;
  const oy = air === 'up' ? 0 : 1;
  // legs first, so the tunic overlaps their tops
  const legY = oy + 12;
  const lift = air === 'none' ? 0 : 1;
  g.rect(ox + 2 + Math.min(0, leg), legY, 2, 3 - lift, hex('#3b2f4a'));
  g.rect(ox + 6 + Math.max(0, leg), legY, 2, 3 - (air === 'up' ? 0 : lift), hex('#3b2f4a'));
  g.rect(ox + 2 + Math.min(0, leg), legY + 3 - lift, 2, 1, hex('#5a3a2a'));
  g.rect(ox + 6 + Math.max(0, leg), legY + 3 - (air === 'up' ? 0 : lift), 2, 1, hex('#5a3a2a'));
  // tunic, lit on its left edge
  g.rect(ox + 1, oy + 6, 8, 6, hex('#2f8f8a'));
  g.rect(ox + 1, oy + 6, 2, 5, hex('#5cc4b0'));
  g.rect(ox + 7, oy + 8, 2, 4, hex('#1f6464'));
  // arms swing against the legs
  g.rect(ox + (leg > 0 ? 0 : 9), oy + 7 + (air === 'up' ? -2 : 0), 1, 3, hex('#f2c69b'));
  // head and cap
  g.rect(ox + 2, oy + 1, 6, 5, hex('#f2c69b'));
  g.rect(ox + 2, oy + 4, 1, 2, hex('#d9a47a'));
  g.rect(ox + 1, oy, 8, 2, hex('#e0a43a'));
  g.rect(ox + 6, oy + 1, 4, 1, hex('#b87e22'));
  g.px(ox + 6, oy + 3, INK);
  // scarf, its tail streaming behind
  g.rect(ox + 1, oy + 6, 8, 1, hex('#c8483f'));
  g.rect(ox - 1, oy + 6 + (air === 'none' ? 1 : 0), 2, 1, hex('#e06a5a'));
  g.outline(INK);
  return g;
}

function coinFrame(i: number): PixelGrid {
  const g = new PixelGrid(COIN.w, COIN.h);
  // a turning coin: its face narrows to an edge and back
  const rx = [3.5, 2.5, 0.8, 2.5][i]!;
  g.ellipse(4.5, 4.5, rx, 3.5, hex('#f6c945'));
  if (rx > 1) {
    g.ellipse(4.5, 4.5, Math.max(0.6, rx - 1.4), 2.2, hex('#d9a32e'));
    g.px(Math.round(4.5 - rx * 0.5), 2, hex('#fff0a0'));
  }
  g.outline(hex('#6a4a12'));
  return g;
}

function crateFrame(): PixelGrid {
  const g = new PixelGrid(CRATE.w, CRATE.h);
  g.rect(1, 1, 14, 14, hex('#a0683a'));
  for (let y = 4; y < 14; y += 4) g.rect(2, y, 12, 1, hex('#7d4e2a'));
  g.line(2, 13, 13, 2, hex('#c58a52'));
  g.rect(1, 1, 14, 1, hex('#d6a066'));
  g.rect(1, 1, 1, 14, hex('#c58a52'));
  g.rect(14, 2, 1, 13, hex('#6a4226'));
  g.rect(2, 14, 13, 1, hex('#6a4226'));
  g.outline(INK);
  return g;
}

function platformFrame(): PixelGrid {
  const g = new PixelGrid(PLATFORM.w, PLATFORM.h);
  const w = PLATFORM.w - 2;
  g.rect(1, 1, w, 6, hex('#7f8aa0'));
  g.rect(1, 1, w, 2, hex('#b9c3d6'));
  g.rect(1, 6, w, 1, hex('#4c5468'));
  for (let x = 5; x < w; x += 10) g.px(x, 4, hex('#3a4052'));
  // two little lamps underneath show which way is down on a thing that floats
  g.rect(4, 7, 3, 2, hex('#ffd36a'));
  g.rect(w - 5, 7, 3, 2, hex('#ffd36a'));
  g.outline(INK);
  return g;
}

function flagFrame(i: number): PixelGrid {
  const g = new PixelGrid(FLAG.w, FLAG.h);
  g.rect(3, 2, 2, 26, hex('#d8d8e0'));
  g.rect(3, 2, 1, 26, hex('#ffffff'));
  g.rect(2, 27, 4, 2, hex('#6a6478'));
  // the cloth ripples between two frames
  for (let x = 0; x < 10; x++) {
    const wave = i === 0 ? Math.round(Math.sin(x * 0.8)) : Math.round(Math.sin(x * 0.8 + 2));
    g.rect(5 + x, 3 + wave, 1, 7, x < 3 ? hex('#b46ee0') : hex('#9b4fd0'));
    g.px(5 + x, 9 + wave, hex('#6c2ea0'));
  }
  g.outline(INK);
  return g;
}

/** The whole level's ground in one canvas: grass on tops, speckled earth under it, one-way planks. */
function groundCanvas(level: LevelData): HTMLCanvasElement {
  const g = new PixelGrid(LEVEL_PX_W, LEVEL_PX_H);
  for (let ty = 0; ty < LEVEL_H; ty++) {
    for (let tx = 0; tx < LEVEL_W; tx++) {
      const x0 = tx * TILE;
      const y0 = ty * TILE;
      if (level.solid(tx, ty)) {
        const top = !level.solid(tx, ty - 1);
        for (let y = 0; y < TILE; y++) {
          for (let x = 0; x < TILE; x++) {
            const n = hash2(x0 + x, y0 + y);
            let c = n > 0.9 ? hex('#8d6038') : n < 0.1 ? hex('#5e3b22') : hex('#7a4f2e');
            if (top && y < 3) c = y === 0 ? hex('#a8e070') : hex('#5fb34a');
            else if (top && y === 3) c = n > 0.5 ? hex('#3f7a34') : hex('#5e3b22');
            g.px(x0 + x, y0 + y, c);
          }
        }
        // a grass blade or two hanging over the edge
        if (top && !level.solid(tx - 1, ty)) g.px(x0, y0 + 3, hex('#5fb34a'));
      } else if (level.oneWay(tx, ty)) {
        g.rect(x0, y0, TILE, 1, hex('#e6b47a'));
        g.rect(x0, y0 + 1, TILE, 3, hex('#9c6638'));
        g.rect(x0, y0 + 4, TILE, 1, hex('#5e3b22'));
        if (tx % 2 === 0) g.rect(x0 + 2, y0 + 5, 2, 3, hex('#5e3b22'));
      }
    }
  }
  return g.toCanvas();
}

/** Paints and registers everything; call once per textures registry (it replaces what was there). */
export function paintArt(textures: TextureRegistry, level: LevelData): void {
  const hero = [heroFrame(0, 'none'), heroFrame(-1, 'none'), heroFrame(0, 'none'), heroFrame(1, 'none'), heroFrame(0, 'up'), heroFrame(1, 'down')];
  textures.addSpriteSheet(HERO.key, makeSheet(hero), { frameWidth: HERO.w, frameHeight: HERO.h });
  textures.addSpriteSheet(COIN.key, makeSheet([0, 1, 2, 3].map(coinFrame)), { frameWidth: COIN.w, frameHeight: COIN.h });
  textures.addSpriteSheet(CRATE.key, makeSheet([crateFrame()]), { frameWidth: CRATE.w, frameHeight: CRATE.h });
  textures.addSpriteSheet(PLATFORM.key, makeSheet([platformFrame()]), { frameWidth: PLATFORM.w, frameHeight: PLATFORM.h });
  textures.addSpriteSheet(FLAG.key, makeSheet([flagFrame(0), flagFrame(1)]), { frameWidth: FLAG.w, frameHeight: FLAG.h });
  textures.addCanvas(GROUND, groundCanvas(level));
}
