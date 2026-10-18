import type { TextureRegistry } from '../core/TextureRegistry';

/*
 * The ambient life's own pixels (leaves, seeds, embers, motes, ash, butterflies, birds, fireflies and chimney smoke),
 * painted once into small canvases, the way the weather's are (`paintWeatherArt`). Whole world pixels in flat
 * colours, lit from the up-left, never a soft glow. Feed the keys it returns to `Drift`, `Birds`, `Butterflies`,
 * `Fireflies` and `ChimneySmoke`.
 */

/** A pixel of life art: x, y and a CSS colour. */
export type LifePixel = readonly [x: number, y: number, color: string];

/** The colours the life is painted in; every one may be replaced to suit a game's palette. */
export interface LifeColors {
  /** Each leaf tone, [lit, deep]. */
  leaves: readonly (readonly [string, string])[];
  /** A seed: the whole one, and the second pixel of the longer one. */
  seed: readonly [string, string];
  /** An ember from hot to cool. */
  ember: readonly [string, string, string];
  /** Two motes. */
  mote: readonly [string, string];
  /** Two flakes of ash: [lit, deep] each. */
  ash: readonly (readonly [string, string])[];
  /** Each butterfly tone, [wing, wing's edge]. */
  butterflies: readonly (readonly [string, string])[];
  butterflyBody: string;
  bird: string;
  /** Its shadow's middle and ends (translucent black suits any ground). */
  birdShadow: readonly [middle: string, ends: string];
  /** A firefly's glow and the dim pixels round it. */
  firefly: readonly [lit: string, dim: string];
  /** Smoke: light (up-left), middle, dark (down-right). */
  smoke: readonly [string, string, string];
}

export const LIFE_COLORS: LifeColors = {
  leaves: [
    ['#7ab04e', '#3d7a36'],
    ['#d8a040', '#9a5a24'],
  ],
  seed: ['#f6f2e4', '#c8c2b0'],
  ember: ['#ffd070', '#ff8a30', '#a8481c'],
  mote: ['rgba(206,226,240,0.85)', 'rgba(150,180,206,0.7)'],
  ash: [
    ['#8a827c', '#5c5652'],
    ['#6e6864', '#3e3a38'],
  ],
  butterflies: [
    ['#f0d050', '#9a7420'],
    ['#f4f0e8', '#a8a098'],
    ['#e8883a', '#8a4418'],
    ['#9ab8f0', '#465e9c'],
  ],
  butterflyBody: '#3a2a20',
  bird: '#2c2830',
  birdShadow: ['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.22)'],
  firefly: ['#f0ff9a', '#a8c850'],
  smoke: ['#b8b0b4', '#9a9296', '#7c7478'],
};

/** The texture keys painted, laid out the way the life classes take them. */
export interface LifeArt {
  /** `Drift` looks for each kind. */
  leaves: string[][];
  seeds: string[][];
  embers: string[][];
  motes: string[][];
  ash: string[][];
  /** `Butterflies` looks: [open, shut] per tone. */
  butterflies: [string, string][];
  /** `Birds` frames and shadow. */
  bird: [string, string];
  birdShadow: string;
  /** `Fireflies` frames: [dim, lit]. */
  firefly: [string, string];
  /** `ChimneySmoke` frames. */
  puffs: string[];
}

/** Frames a puff of smoke grows through. */
export const PUFF_FRAMES = 6;

/** CSS rgba of a `#rrggbb` colour at `alpha`. */
function withAlphaCss(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * One puff of smoke at `frame` (0..PUFF_FRAMES-1): a ragged blob, light on its up-left and dark on its down-right, that
 * grows as it climbs. Its corner pixels come and go by a fixed hash, so it is no clean ellipse, and the last two
 * frames lose every other pixel on a checkerboard, the way every effect dithers out. Pure.
 */
export function puffPixels(frame: number, colors: readonly [string, string, string] = LIFE_COLORS.smoke): { w: number; h: number; px: LifePixel[] } {
  const sizes: readonly (readonly [number, number])[] = [[2, 2], [3, 3], [4, 3], [5, 4], [6, 5], [7, 5]];
  const [w, h] = sizes[Math.max(0, Math.min(PUFF_FRAMES - 1, frame))]!;
  const [light, mid, dark] = colors;
  const px: LifePixel[] = [];
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const alpha = frame < 3 ? 0.9 : frame < 5 ? 0.78 : 0.62;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / (w / 2);
      const ny = (y - cy) / (h / 2);
      const rim = ((x * 7 + y * 13 + frame * 5) % 5) / 10;
      if (nx * nx + ny * ny > 0.85 + rim) continue;
      if (frame >= PUFF_FRAMES - 2 && (x + y + frame) % 2) continue;
      const lit = nx + ny;
      const tone = lit < -0.35 ? light : lit > 0.45 ? dark : mid;
      px.push([x, y, tone.startsWith('#') ? withAlphaCss(tone, alpha) : tone]);
    }
  }
  return { w, h, px };
}

/** Width of the page the life's art is laid on. */
const PAGE_W = 64;

/**
 * Where each of `sizes` goes on one page `width` wide: left to right, a new row below the tallest of the last when the
 * next does not fit, one clear pixel between pieces (so nothing bleeds into a neighbour). Also the page's height.
 */
export function packShelves(sizes: readonly (readonly [w: number, h: number])[], width = PAGE_W): { at: [number, number][]; height: number } {
  const at: [number, number][] = [];
  let x = 0;
  let y = 0;
  let row = 0;
  for (const [w, h] of sizes) {
    if (x > 0 && x + w > width) {
      x = 0;
      y += row + 1;
      row = 0;
    }
    at.push([x, y]);
    x += w + 1;
    row = Math.max(row, h);
  }
  return { at, height: y + row };
}

interface Piece {
  key: string;
  w: number;
  h: number;
  pixels: readonly LifePixel[];
}

let pages = 0;

/**
 * Lays every piece not yet registered on one page and registers each under its own key as a view of it
 * (`TextureRegistry.addView`). A butterfly flapping, a puff growing or a leaf turning swaps between frames of one
 * source, which Pixi batches; a canvas each made it rebuild the world's draw instructions at every swap (2026-10-18).
 */
function layOut(textures: TextureRegistry, prefix: string, pieces: readonly Piece[]): void {
  const todo = pieces.filter((p) => !textures.exists(p.key));
  if (!todo.length) return;
  const { at, height } = packShelves(todo.map((p) => [p.w, p.h]));
  const c = document.createElement('canvas');
  c.width = PAGE_W;
  c.height = Math.max(1, height);
  const g = c.getContext('2d')!;
  todo.forEach((p, i) => {
    const [ox, oy] = at[i]!;
    for (const [x, y, color] of p.pixels) {
      g.fillStyle = color;
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  });
  const page = `${prefix}page${++pages}`;
  textures.addCanvas(page, c);
  todo.forEach((p, i) => textures.addView(p.key, page, at[i]![0], at[i]![1], p.w, p.h));
}

/**
 * Paints the life's art under `prefix` (default `'life_'`) and returns its keys. A key already registered is kept, so
 * calling it again (every map) costs nothing — and painting other colours needs another prefix.
 */
export function paintLifeArt(textures: TextureRegistry, colors: Partial<LifeColors> = {}, prefix = 'life_'): LifeArt {
  const c: LifeColors = { ...LIFE_COLORS, ...colors };
  const k = (name: string) => prefix + name;
  // every piece is noted here and laid on one page at the end (`layOut`)
  const pieces: Piece[] = [];
  const paint = (_textures: TextureRegistry, key: string, w: number, h: number, pixels: readonly LifePixel[]): string => {
    pieces.push({ key, w, h, pixels });
    return key;
  };
  // a leaf tumbling: lying flat, on its edge-ways tilt, and end-on
  const leaves = c.leaves.map(([lit, deep], t) => [
    paint(textures, k(`leaf_${t}_0`), 2, 1, [[0, 0, lit], [1, 0, deep]]),
    paint(textures, k(`leaf_${t}_1`), 2, 2, [[0, 0, lit], [1, 1, deep]]),
    paint(textures, k(`leaf_${t}_2`), 1, 2, [[0, 0, lit], [0, 1, deep]]),
  ]);
  const seeds = [
    [paint(textures, k('seed_0'), 1, 1, [[0, 0, c.seed[0]]])],
    [paint(textures, k('seed_1'), 2, 1, [[0, 0, c.seed[0]], [1, 0, c.seed[1]]])],
  ];
  const embers = [c.ember.map((col, i) => paint(textures, k(`ember_${i}`), 1, 1, [[0, 0, col]]))];
  const motes = c.mote.map((col, i) => [paint(textures, k(`mote_${i}`), 1, 1, [[0, 0, col]])]);
  const ash = c.ash.map(([lit, deep], i) =>
    // the first flake flat, the next tumbling on its corner
    [paint(textures, k(`ash_${i}`), 2, i % 2 ? 2 : 1, i % 2 ? [[0, 0, lit], [1, 1, deep]] : [[0, 0, lit], [1, 0, deep]])],
  );
  const body = c.butterflyBody;
  const butterflies = c.butterflies.map(([wing, edge], t): [string, string] => [
    paint(textures, k(`fly_${t}_o`), 3, 2, [[0, 0, wing], [2, 0, wing], [1, 0, body], [0, 1, edge], [1, 1, body], [2, 1, edge]]),
    paint(textures, k(`fly_${t}_c`), 3, 2, [[1, 0, wing], [1, 1, edge]]),
  ]);
  // seen from above: wings raised (a V), then the downstroke (a flat bar with the body under it)
  const b = c.bird;
  const bird: [string, string] = [
    paint(textures, k('bird_0'), 5, 2, [[0, 0, b], [4, 0, b], [1, 1, b], [2, 1, b], [3, 1, b]]),
    paint(textures, k('bird_1'), 5, 2, [[0, 1, b], [1, 0, b], [2, 0, b], [3, 0, b], [4, 1, b]]),
  ];
  const [mid, ends] = c.birdShadow;
  const birdShadow = paint(textures, k('bird_shadow'), 3, 1, [[0, 0, ends], [1, 0, mid], [2, 0, ends]]);
  const [lit, dim] = c.firefly;
  const firefly: [string, string] = [
    paint(textures, k('firefly_dim'), 3, 3, [[1, 1, dim]]),
    paint(textures, k('firefly_lit'), 3, 3, [[1, 1, lit], [0, 1, dim], [2, 1, dim], [1, 0, dim], [1, 2, dim]]),
  ];
  const puffs: string[] = [];
  for (let f = 0; f < PUFF_FRAMES; f++) {
    const { w, h, px } = puffPixels(f, c.smoke);
    puffs.push(paint(textures, k(`puff_${f}`), w, h, px));
  }
  layOut(textures, prefix, pieces);
  return { leaves, seeds, embers, motes, ash, butterflies, bird, birdShadow, firefly, puffs };
}
