import { type Color, channels, mix, rgba, shade } from './pixel';

/*
 * Hue-shifted ramps: the one place a character's colours get their shadows and lights. A small pixel body cannot get
 * detail from extra pixels, so it gets it from colour — a shadow that only darkens reads as dirt, a light that only
 * whitens reads as chalk. Here a shadow drifts toward its material's cool (or, for skin and leather, warm red) hue
 * and gains a little saturation; a light drifts toward warm yellow and loses a little. Everything the rig paints
 * goes through `hueShade`.
 *
 * The materials below are built in; a game adds its own (glass, slime, bark…) with `registerMaterial`, or changes how a
 * built-in one shades by registering it again. A material nobody registered shades as cloth.
 */

/** The materials every game starts with. */
export type BuiltinMaterial = 'cloth' | 'leather' | 'mail' | 'plate' | 'dragon' | 'fur' | 'skin' | 'hair' | 'gold' | 'gem' | 'shadow';
/** A built-in material or one a game registered (`registerMaterial`). */
export type Material = BuiltinMaterial | (string & {});

/** How a material's shadows and lights move its hue. */
export interface MaterialLight {
  /** Hue (degrees) a shadow drifts toward, and how far it drifts at a factor of 0.5. */
  cool: number;
  coolDeg: number;
  /** Saturation a shadow gains at a factor of 0.5. */
  coolSat: number;
  /** Hue a light drifts toward, and how far it drifts at a factor of 1.3. */
  warm: number;
  warmDeg: number;
}

const LIGHT: Record<string, MaterialLight> = {
  // wool and linen: violet shadows, faintly warm lights
  cloth: { cool: 255, coolDeg: 14, coolSat: 0.06, warm: 50, warmDeg: 6 },
  // hide: its shadows go red-brown, never grey
  leather: { cool: 8, coolDeg: 12, coolSat: 0.08, warm: 45, warmDeg: 8 },
  // steel: blue shadows, lights close to white
  mail: { cool: 232, coolDeg: 16, coolSat: 0.07, warm: 52, warmDeg: 4 },
  plate: { cool: 235, coolDeg: 18, coolSat: 0.08, warm: 50, warmDeg: 6 },
  // scale: crimson-violet shadows, ember-orange lights
  dragon: { cool: 330, coolDeg: 16, coolSat: 0.06, warm: 36, warmDeg: 12 },
  fur: { cool: 262, coolDeg: 10, coolSat: 0.04, warm: 48, warmDeg: 6 },
  // skin: shadows go to blood-red, never to grey or green
  skin: { cool: 350, coolDeg: 14, coolSat: 0.09, warm: 42, warmDeg: 5 },
  hair: { cool: 262, coolDeg: 14, coolSat: 0.05, warm: 46, warmDeg: 10 },
  gold: { cool: 14, coolDeg: 14, coolSat: 0.05, warm: 58, warmDeg: 8 },
  gem: { cool: 262, coolDeg: 8, coolSat: 0.02, warm: 50, warmDeg: 2 },
  // the side turned away from the light, whatever it is made of (the far limbs)
  shadow: { cool: 255, coolDeg: 12, coolSat: 0.04, warm: 50, warmDeg: 0 },
};

/** Tones of one colour in one material, darkest to brightest. `base` is the colour itself. */
export interface Ramp {
  /** Under-edges, rivets, seams: the darkest tone that is still the material. */
  deep: Color;
  dark: Color;
  mid: Color;
  base: Color;
  light: Color;
  /** One specular pixel: a plate's glint, a strand of hair, a buckle. */
  glint: Color;
}

/** Five shading factors, darkest to brightest. */
export type RampFactors = [number, number, number, number, number];

/** The factors each material's ramp is built from: metal is contrasty, fur and skin are soft. */
const RAMP_FACTORS: Record<string, RampFactors> = {
  cloth: [0.5, 0.66, 0.82, 1.12, 1.25],
  leather: [0.46, 0.62, 0.8, 1.16, 1.3],
  mail: [0.44, 0.6, 0.78, 1.22, 1.42],
  plate: [0.44, 0.56, 0.72, 1.2, 1.45],
  dragon: [0.42, 0.56, 0.74, 1.14, 1.32],
  fur: [0.56, 0.7, 0.84, 1.15, 1.26],
  skin: [0.6, 0.72, 0.86, 1.12, 1.24],
  hair: [0.5, 0.66, 0.8, 1.2, 1.36],
  gold: [0.42, 0.62, 0.8, 1.3, 1.5],
  gem: [0.32, 0.5, 0.78, 1.45, 1.65],
  shadow: [0.5, 0.66, 0.82, 1.12, 1.25],
};

/** Every registered material, built-in ones first. */
export const MATERIALS: readonly Material[] = Object.keys(LIGHT);

/** Every factor a ramp or a painter shades by — what a recolour or a fine-pass mask has to recognise. */
export const RAMP_FACTOR_SET: readonly number[] = [...new Set(Object.values(RAMP_FACTORS).flat())];

/**
 * Adds a material, or changes a built-in one: how its shadows and lights drift (`light`) and the five factors its
 * ramp is built from, darkest to brightest (`factors`, around 1: below darkens, above lifts). Register before painting
 * with it; tones already worked out for that material are forgotten.
 */
export function registerMaterial(name: string, material: { light: MaterialLight; factors: RampFactors }): void {
  LIGHT[name] = material.light;
  RAMP_FACTORS[name] = material.factors;
  if (!(MATERIALS as Material[]).includes(name)) (MATERIALS as Material[]).push(name);
  const factors = RAMP_FACTOR_SET as number[];
  for (const f of material.factors) if (!factors.includes(f)) factors.push(f);
  for (const cache of [CACHE, RAMPS] as Map<string, unknown>[]) for (const key of [...cache.keys()]) if (key.endsWith(`:${name}`)) cache.delete(key);
}

const lightOf = (m: Material): MaterialLight => LIGHT[m] ?? LIGHT.cloth!;
const factorsOf = (m: Material): RampFactors => RAMP_FACTORS[m] ?? RAMP_FACTORS.cloth!;

function toHsv(c: Color): [number, number, number] {
  const [r, g, b] = channels(c);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [h * 60, max === 0 ? 0 : d / max, max / 255];
}

function fromHsv(h: number, s: number, v: number, a: number): Color {
  const hh = (((h % 360) + 360) % 360) / 60;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6]!;
  return rgba(r! * 255, g! * 255, b! * 255, a);
}

/** Hue `h` moved up to `deg` degrees toward `target`, the short way round. */
function drift(h: number, target: number, deg: number): number {
  let d = target - h;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return h + Math.sign(d) * Math.min(Math.abs(d), deg);
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const CACHE = new Map<string, Color>();

/**
 * `c` shaded by `f` the way `shade` would (f < 1 darkens, f > 1 lifts toward white), with the hue moved the way
 * `material` moves it. `f === 1` returns `c` itself. A colour with too little saturation to have a hue (steel,
 * grey wool, white linen) takes the material's hue outright, faintly, so a grey coat still has a violet shadow.
 */
export function hueShade(c: Color, f: number, material: Material): Color {
  if (f === 1) return c;
  const key = `${c}:${f}:${material}`;
  let out = CACHE.get(key);
  if (out !== undefined) return out;
  const L = lightOf(material);
  const plain = shade(c, f);
  const [h, s, v] = toHsv(plain);
  const a = plain >>> 24;
  // how grey the colour is: a grey has no hue of its own to move, so it is tinted with the target hue instead —
  // drifting a grey's accidental hue partway round the wheel is how steel turned green in its lights
  const grey = clamp01(1 - toHsv(c)[1] / 0.14);
  let coloured: Color;
  let tinted: Color;
  if (f < 1) {
    const k = (1 - f) / 0.5;
    coloured = fromHsv(drift(h, L.cool, L.coolDeg * k), clamp01(s + L.coolSat * k), v, a);
    tinted = fromHsv(L.cool, clamp01(s + L.coolSat * k * 1.2), v, a);
  } else {
    const k = Math.min(1.5, (f - 1) / 0.3);
    // lifting toward white bleaches; a warm light keeps a little of its colour back
    coloured = fromHsv(drift(h, L.warm, L.warmDeg * k), clamp01(s * 1.08), v, a);
    tinted = fromHsv(L.warm, clamp01(s + 0.03 * k), v, a);
  }
  out = grey > 0 ? mix(coloured, tinted, grey) : coloured;
  CACHE.set(key, out);
  return out;
}

const RAMPS = new Map<string, Ramp>();

export function ramp(c: Color, material: Material): Ramp {
  const key = `${c}:${material}`;
  let r = RAMPS.get(key);
  if (!r) {
    const [deep, dark, mid, light, glint] = factorsOf(material).map((f) => hueShade(c, f, material)) as [Color, Color, Color, Color, Color];
    r = { deep, dark, mid, base: c, light, glint };
    RAMPS.set(key, r);
  }
  return r;
}

/** Every tone of `c`'s ramp, for masking a material cue to that material. */
export function rampTones(c: Color, material: Material): Color[] {
  const r = ramp(c, material);
  return [r.deep, r.dark, r.mid, r.base, r.light, r.glint];
}

const DEEP = new Map<Color, Color>();

/**
 * The selective-outline tone of a fill: its own hue, cooled and pushed dark enough to hold an edge against grass
 * (value at most 0.3), so the outline on the lit side is the fill's own darkest shade instead of flat black.
 */
export function outlineOf(c: Color): Color {
  let d = DEEP.get(c);
  if (d === undefined) {
    const [h, s, v] = toHsv(hueShade(c, 0.42, 'shadow'));
    d = fromHsv(h, clamp01(s * 1.1 + 0.08), Math.min(v, 0.3), 255);
    DEEP.set(c, d);
  }
  return d;
}
