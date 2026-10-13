/**
 * The combat sounds are written, not recorded: a few oscillator or noise layers rendered straight into a buffer
 * (`sounds.json` → `recipes`). Lo-fi on purpose — 22 kHz mono, short and soft — so they sit with the pixel art
 * instead of pretending to be a recording.
 */
export const SYNTH_RATE = 22050;

export interface SynthLayer {
  /** Waveform; `noise` is white noise, or sample-and-hold noise at `f` Hz when `f` is given (crunchier). */
  w: 'sine' | 'square' | 'tri' | 'saw' | 'noise';
  /** Pitch at the start and at the end of the layer (Hz), swept exponentially. */
  f?: [number, number];
  /** Length (s). */
  t: number;
  /** Delay before the layer starts (s). */
  d?: number;
  /** Attack (s). */
  at?: number;
  g: number;
  /** Decay curve exponent: 1 is linear, higher falls away faster. */
  c?: number;
  duty?: number;
  /** Low- and high-pass cutoff at the start and the end (Hz). */
  lp?: [number, number];
  hp?: [number, number];
}

export interface SynthRecipe {
  layers: SynthLayer[];
  /** Random pitch spread per play (share of 1); the engine's default when absent. */
  jitter?: number;
  /** Level of the sound's recorded takes (`registerTakes`), which are normalised on decode; default 1. */
  fileGain?: number;
}

const WAVES: Record<Exclude<SynthLayer['w'], 'noise'>, (p: number, duty: number) => number> = {
  sine: (p) => Math.sin(p * Math.PI * 2),
  square: (p, duty) => (p < duty ? 1 : -1),
  tri: (p) => 1 - 4 * Math.abs(p - 0.5),
  saw: (p) => 2 * p - 1,
};

const sweep = (a: number, b: number, k: number): number => (a > 0 && b > 0 ? a * Math.pow(b / a, k) : a + (b - a) * k);

/** A one-pole filter is enough for a stand-in, and it cannot ring or blow up the way a swept biquad can. */
function onePole(cut: number): number {
  return 1 - Math.exp((-2 * Math.PI * Math.min(cut, SYNTH_RATE * 0.45)) / SYNTH_RATE);
}

export function renderRecipe(recipe: SynthRecipe): Float32Array {
  const total = Math.max(...recipe.layers.map((l) => (l.d ?? 0) + l.t));
  const out = new Float32Array(Math.ceil(total * SYNTH_RATE) + 1);
  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff) * 2 - 1;
  };
  for (const l of recipe.layers) {
    const start = Math.round((l.d ?? 0) * SYNTH_RATE);
    const n = Math.round(l.t * SYNTH_RATE);
    const at = Math.max(1, Math.round((l.at ?? 0.004) * SYNTH_RATE));
    let phase = 0;
    let held = 0;
    let lpState = 0;
    let hpState = 0;
    for (let i = 0; i < n && start + i < out.length; i++) {
      const k = i / n;
      const freq = l.f ? sweep(l.f[0], l.f[1], k) : 0;
      phase += freq / SYNTH_RATE;
      const p = phase - Math.floor(phase);
      let s: number;
      if (l.w === 'noise') {
        // sample-and-hold: a new value each time the phase wraps, which is what makes it crunch
        if (!l.f || p < freq / SYNTH_RATE || i === 0) held = rand();
        s = l.f ? held : rand();
      } else s = WAVES[l.w](p, l.duty ?? 0.5);
      if (l.lp) {
        lpState += (s - lpState) * onePole(sweep(l.lp[0], l.lp[1], k));
        s = lpState;
      }
      if (l.hp) {
        hpState += (s - hpState) * onePole(sweep(l.hp[0], l.hp[1], k));
        s -= hpState;
      }
      const env = i < at ? i / at : Math.pow(1 - (i - at) / Math.max(1, n - at), l.c ?? 2);
      out[start + i]! += s * env * l.g;
    }
  }
  // a stand-in never clips: peaks are brought back under full scale
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0.95) for (let i = 0; i < out.length; i++) out[i]! *= 0.95 / peak;
  return out;
}
