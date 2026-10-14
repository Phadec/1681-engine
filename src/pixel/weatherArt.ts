import type { TextureRegistry } from '../core/TextureRegistry';
import type { WeatherLook } from '../ambient/WeatherLayer';

/** A pixel of weather art: x, y and a CSS colour. */
export type WeatherPixel = readonly [x: number, y: number, color: string];

/** The colours the weather is painted in; every one may be replaced to suit a game's palette. */
export interface WeatherColors {
  rainHead: string;
  rainBody: string;
  rainTail: string;
  snow: string;
  snowShade: string;
  ashLight: string;
  ash: string;
  ashDark: string;
  ember: string;
  emberDeep: string;
  mist: string;
}

export const WEATHER_COLORS: WeatherColors = {
  rainHead: 'rgba(214,230,248,0.85)',
  rainBody: 'rgba(168,190,216,0.7)',
  rainTail: 'rgba(128,150,180,0.5)',
  snow: '#f6f9ff',
  snowShade: '#b8c8e0',
  ashLight: '#8a827c',
  ash: '#5c5652',
  ashDark: '#3e3a38',
  ember: '#ffa040',
  emberDeep: '#c0501c',
  mist: 'rgba(226,232,222,0.62)',
};

/** A bank of mist: pixels on a checkerboard, denser toward its middle, ragged at every edge. Pure and seeded. */
export function mistPixels(w: number, h: number, seed: number, color: string): WeatherPixel[] {
  const px: WeatherPixel[] = [];
  let r = seed;
  const rand = () => {
    r = (Math.imul(r, 1103515245) + 12345) & 0x7fffffff;
    return r / 0x7fffffff;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if ((x + y) % 2) continue;
      const nx = (x - w / 2) / (w / 2);
      const ny = (y - h / 2) / (h / 2);
      const d = 1 - (nx * nx + ny * ny);
      if (d > 0 && rand() < d * 0.9) px.push([x, y, color]);
    }
  return px;
}

function paint(textures: TextureRegistry, key: string, w: number, h: number, pixels: readonly WeatherPixel[]): void {
  if (textures.exists(key)) return;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return;
  for (const [x, y, color] of pixels) {
    g.fillStyle = color;
    g.fillRect(x, y, 1, 1);
  }
  textures.addCanvas(key, c);
}

/**
 * Paints a set of weather in whole world pixels, flat colours and never a soft glow (a rain streak is the size of a
 * pixel of the roof it falls past; light from the up-left, so a flake's lit pixel is its top-left one), and returns
 * looks ready for `WeatherLayer`: `rain`, `snow`, `ash` (with an ember now and then) and `fog`. Painted once; a key
 * already in the registry is kept.
 */
export function paintWeatherArt(
  textures: TextureRegistry,
  colors: Partial<WeatherColors> = {},
  prefix = 'wx_',
): Record<'rain' | 'snow' | 'ash' | 'fog', WeatherLook> {
  const c = { ...WEATHER_COLORS, ...colors };
  const k = (name: string) => prefix + name;
  paint(textures, k('rain_0'), 2, 5, [[1, 0, c.rainHead], [1, 1, c.rainBody], [1, 2, c.rainBody], [0, 3, c.rainTail], [0, 4, c.rainTail]]);
  paint(textures, k('rain_1'), 2, 4, [[1, 0, c.rainHead], [1, 1, c.rainBody], [0, 2, c.rainBody], [0, 3, c.rainTail]]);
  // the splash: a drop's crown, then two beads thrown wide
  paint(textures, k('splash_0'), 5, 2, [[2, 0, c.rainHead], [1, 1, c.rainBody], [3, 1, c.rainBody]]);
  paint(textures, k('splash_1'), 5, 2, [[0, 0, c.rainTail], [4, 0, c.rainTail], [2, 1, c.rainTail]]);
  paint(textures, k('snow_0'), 1, 1, [[0, 0, c.snow]]);
  paint(textures, k('snow_1'), 2, 2, [[0, 0, c.snow], [1, 0, c.snow], [0, 1, c.snow], [1, 1, c.snowShade]]);
  paint(textures, k('snow_2'), 3, 3, [[1, 0, c.snow], [0, 1, c.snow], [1, 1, c.snow], [2, 1, c.snowShade], [1, 2, c.snowShade]]);
  paint(textures, k('ash_0'), 2, 1, [[0, 0, c.ashLight], [1, 0, c.ash]]);
  paint(textures, k('ash_1'), 2, 2, [[0, 0, c.ash], [1, 1, c.ashDark]]);
  paint(textures, k('ash_2'), 1, 2, [[0, 0, c.ember], [0, 1, c.emberDeep]]);
  paint(textures, k('fog_0'), 72, 14, mistPixels(72, 14, 7, c.mist));
  paint(textures, k('fog_1'), 56, 12, mistPixels(56, 12, 31, c.mist));
  return {
    rain: { motion: 'fall', max: 170, keys: [k('rain_0'), k('rain_1')], splash: [k('splash_0'), k('splash_1')], tint: 0x40506a, tintAlpha: 0.1 },
    // the big flake one in five, the big ash an ember one in seven
    snow: { motion: 'flake', max: 120, keys: [k('snow_2'), k('snow_1'), k('snow_0'), k('snow_1'), k('snow_0')], sway: 5, tint: 0xd8e4f0, tintAlpha: 0.08 },
    ash: {
      motion: 'flake',
      max: 90,
      keys: [k('ash_2'), k('ash_1'), k('ash_0'), k('ash_1'), k('ash_0'), k('ash_1'), k('ash_0')],
      vx: [12, 24],
      vy: [10, 22],
      sway: 3,
      tint: 0x5a4a40,
      tintAlpha: 0.08,
    },
    fog: { motion: 'bank', max: 12, keys: [k('fog_0'), k('fog_1')], tint: 0xc8d0c4, tintAlpha: 0.24 },
  };
}
