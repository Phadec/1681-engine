type EaseFn = (t: number) => number;

const linear: EaseFn = (t) => t;

/** Easing functions by the names tween configs use ('Cubic.Out', 'Back.Out', ...). */
const EASES: Record<string, EaseFn> = {
  Linear: linear,
  'Quad.In': (t) => t * t,
  'Quad.Out': (t) => t * (2 - t),
  'Cubic.Out': (t) => 1 - Math.pow(1 - t, 3),
  'Sine.In': (t) => 1 - Math.cos((t * Math.PI) / 2),
  'Sine.InOut': (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  'Back.Out': (t) => {
    const s = 1.70158;
    const u = t - 1;
    return u * u * ((s + 1) * u + s) + 1;
  },
};

export function easeByName(name: string | undefined): EaseFn {
  if (!name) return EASES['Quad.Out']!; // Phaser's default tween ease is Power1 = Quad.Out
  const fn = EASES[name];
  if (!fn) console.warn(`[tween] unknown ease ${name}`);
  return fn ?? linear;
}
