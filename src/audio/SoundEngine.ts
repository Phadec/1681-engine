import { engineSettings } from '../settings';
import { hasTakes, SampleBank } from './sampleBank';
import { SOUNDS } from './soundTable';
import { renderRecipe, SYNTH_RATE } from './synth';

/**
 * Plays sound effects through Web Audio, on a gain of their own (`engineSettings.sfxVolume`, beside the music's).
 * A sound is one of its recorded takes (`registerTakes`, `SampleBank`) when it has
 * any, else its `sounds.json` recipe rendered once into a buffer the first time it is asked for. A sound in the
 * world fades with its distance from the local player, pans with where it happened and loses its highs as it goes
 * (`MUFFLE`); the local player's own swings and blows play at full weight, everyone else's at `OTHERS`.
 *
 * Kept lean on purpose (an earlier, much larger set of effects was taken out for being too busy): one sound per
 * kind per `MIN_GAP_MS`, never more than `MAX_VOICES` at once, and nothing but combat.
 */

/** Beyond this (px) a sound in the world is not heard at all. */
const HEARING = 480;
const MAX_VOICES = 10;
/** Minor sounds (footsteps) start only while fewer than this are playing, so they never take a blow's voice. */
const MINOR_VOICES = 6;
/** The same kind twice inside this (ms) is one sound: a cleave clipping six bodies lands once. */
const MIN_GAP_MS = 60;
/** Weight of what other players, pets and monsters do, against the local player's own. */
const OTHERS = 0.45;
const DEFAULT_JITTER = 0.05;
/** A sound cut short by `maxMs` fades out over this, so the cut does not click. */
const CUT_FADE_MS = 80;
/** Low-pass cutoff (Hz) right beside the listener and at the edge of hearing: far blows sound dull, not just quiet. */
const MUFFLE: [number, number] = [18000, 1800];
/**
 * The tone of the whole effects bus: the recorded takes came back bright (hiss, glassy ice, blade scrapes) and read
 * as shrill next to the music, so the highs are shelved down and the very top cut, for every sound at once.
 */
const TAME_SHELF = { freq: 3500, gainDb: -7 };
const TAME_TOP = 11000;

interface PlayOptions {
  /** Where it happened in the world; absent for what happens to or is done by the local player. */
  x?: number;
  y?: number;
  /** Done by (or to) the local player: full weight. */
  local?: boolean;
  /** Extra weight (default 1). */
  gain?: number;
  /** How far away it can be heard (px), when nearer than `HEARING`. */
  range?: number;
  /** Skipped when the mix is busy (footsteps). */
  minor?: boolean;
  /** Cut off after this long (ms), faded over `CUT_FADE_MS`: a cast's sound ends with the cast. */
  maxMs?: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer | null>();
  private readonly samples = new SampleBank();
  private readonly lastAt = new Map<string, number>();
  private voices = 0;
  /** Where the local player stands, set by the world scene; null off the world screens. */
  listener: () => { x: number; y: number } | null = () => null;
  private onRunning: (running: boolean) => void = () => {};

  constructor() {
    if (typeof window === 'undefined') return;
    // iOS lets a page start sound only inside a gesture, counts `touchend` (not `pointerdown`) as one, and leaves
    // the context 'interrupted' after the app comes back from the background: every touch retries until it runs
    const unlock = () => {
      const ctx = this.context();
      if (!ctx || ctx.state === 'running') return;
      void ctx.resume();
      // one silent sample started inside the gesture is what WebKit needs to open the output
      const blank = ctx.createBufferSource();
      blank.buffer = ctx.createBuffer(1, 1, 22050);
      blank.connect(ctx.destination);
      blank.start();
    };
    // listening only while the context is not running: once it runs a touch has nothing to do, and the listeners
    // come back the moment it stops (the interrupted iOS case)
    const types = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;
    const listen = (on: boolean) => {
      for (const type of types) {
        if (on) window.addEventListener(type, unlock, { capture: true });
        else window.removeEventListener(type, unlock, { capture: true });
      }
    };
    this.onRunning = (running) => listen(!running);
    listen(true);
    // game sound, not media: it follows the ring/silent switch and mixes with the player's own music (iOS 17+)
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    engineSettings.subscribe((s) => {
      if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.level(s.sfxVolume), this.ctx.currentTime, 0.02);
    });
  }

  play(name: string | undefined, opts: PlayOptions = {}): void {
    if (!name || (!SOUNDS.recipes[name] && !hasTakes(name))) return;
    if (engineSettings.getState().sfxVolume <= 0) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.voices >= (opts.minor ? MINOR_VOICES : MAX_VOICES)) return;
    let gain = (opts.gain ?? 1) * (opts.local ? 1 : OTHERS);
    let pan = 0;
    let far = 0;
    if (opts.x !== undefined && opts.y !== undefined) {
      const me = this.listener();
      if (me) {
        const dx = opts.x - me.x;
        const d = Math.hypot(dx, opts.y - me.y);
        const hearing = Math.min(HEARING, opts.range ?? HEARING);
        if (d >= hearing) return;
        gain *= Math.pow(1 - d / hearing, 1.5);
        far = d / HEARING;
        pan = Math.max(-0.7, Math.min(0.7, dx / 320));
      }
    }
    if (gain < 0.03) return;
    const now = performance.now();
    if (now - (this.lastAt.get(name) ?? -1e9) < MIN_GAP_MS) return;
    const take = this.samples.take(ctx, name);
    const buffer = take ?? this.buffer(ctx, name);
    if (!buffer) return;
    if (take) gain *= SOUNDS.recipes[name]?.fileGain ?? 1;
    this.lastAt.set(name, now);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const jitter = SOUNDS.recipes[name]?.jitter ?? DEFAULT_JITTER;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * jitter;
    const g = ctx.createGain();
    g.gain.value = Math.min(1, gain);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = MUFFLE[0] * Math.pow(MUFFLE[1] / MUFFLE[0], far);
    src.connect(lp).connect(g).connect(p).connect(this.master!);
    this.voices++;
    src.onended = () => {
      this.voices--;
      src.disconnect();
      lp.disconnect();
      g.disconnect();
      p.disconnect();
    };
    src.start();
    const lasts = (buffer.duration / src.playbackRate.value) * 1000;
    if (opts.maxMs !== undefined && lasts > opts.maxMs) {
      const end = ctx.currentTime + Math.max(CUT_FADE_MS, opts.maxMs) / 1000;
      g.gain.setValueAtTime(g.gain.value, end - CUT_FADE_MS / 1000);
      g.gain.linearRampToValueAtTime(0, end);
      src.stop(end);
    }
  }

  private level(volume: number): number {
    return Math.max(0, Math.min(1, volume)) * SOUNDS.master;
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof AudioContext === 'undefined') return null;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.level(engineSettings.getState().sfxVolume);
    const shelf = this.ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = TAME_SHELF.freq;
    shelf.gain.value = TAME_SHELF.gainDb;
    const top = this.ctx.createBiquadFilter();
    top.type = 'lowpass';
    top.frequency.value = TAME_TOP;
    this.master.connect(shelf).connect(top).connect(this.ctx.destination);
    const ctx = this.ctx;
    const changed = () => {
      const running = ctx.state === 'running';
      this.onRunning(running);
      if (running) this.prerender(ctx);
    };
    ctx.addEventListener('statechange', changed);
    // a context allowed to run from the start changes no state
    if (ctx.state === 'running') queueMicrotask(changed);
    return ctx;
  }

  /**
   * Starts decoding every recorded take and renders every recipe not rendered yet, one per task, once the context
   * first runs — so the first swing of a fight does not pay for its sound in that frame.
   */
  private prerender(ctx: AudioContext): void {
    for (const name of this.samples.names()) this.samples.load(ctx, name);
    // a sound with recorded takes plays them; its recipe is only the fallback while they decode, not worth a 40 ms task
    const todo = Object.keys(SOUNDS.recipes).filter((name) => !this.buffers.has(name) && !hasTakes(name));
    const next = () => {
      const name = todo.shift();
      if (name === undefined) return;
      this.buffer(ctx, name);
      setTimeout(next, 0);
    };
    next();
  }

  /** Rendered on first use or by `prerender` (a few ms each), then kept. */
  private buffer(ctx: AudioContext, name: string): AudioBuffer | null {
    const cached = this.buffers.get(name);
    if (cached !== undefined) return cached;
    const recipe = SOUNDS.recipes[name];
    let buf: AudioBuffer | null = null;
    if (recipe) {
      const data = renderRecipe(recipe);
      buf = ctx.createBuffer(1, data.length, SYNTH_RATE);
      buf.getChannelData(0).set(data);
    }
    this.buffers.set(name, buf);
    return buf;
  }
}

export const sound = new SoundEngine();
