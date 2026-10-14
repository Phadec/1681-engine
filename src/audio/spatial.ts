/** A point in the world, px. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface SpatialMixOptions {
  /** Beyond this (px) the source is not heard (default 480). */
  range?: number;
  /** How the loudness falls off: 1 straight, higher drops faster near the edge of `range` (default 1.5). */
  rolloff?: number;
  /** Px off to one side at which the sound is panned fully that way (default `range / 2`). */
  panWidth?: number;
  /** The furthest it pans, 0–1: 1 is one ear only, which sounds wrong on headphones (default 0.8). */
  maxPan?: number;
  /** Low-pass cutoff (Hz) beside the listener and at the edge of `range`, so far sounds are dull; null for none. */
  muffle?: readonly [number, number] | null;
}

/** How a source sounds from where the listener stands. */
export interface SpatialMix {
  /** Within `range`. */
  audible: boolean;
  /** 0–1. */
  gain: number;
  /** −1 left … 1 right. */
  pan: number;
  /** The low-pass cutoff, Hz (the top of hearing when `muffle` is null). */
  cutoffHz: number;
}

const DEFAULT_MUFFLE: readonly [number, number] = [18000, 1800];

/** The mix of a source at `source` heard from `listener`: louder near, panned to its side, duller far. */
export function spatialMix(listener: Point, source: Point, options: SpatialMixOptions = {}): SpatialMix {
  const range = options.range ?? 480;
  const dx = source.x - listener.x;
  const d = Math.hypot(dx, source.y - listener.y);
  const maxPan = options.maxPan ?? 0.8;
  const pan = Math.max(-maxPan, Math.min(maxPan, dx / (options.panWidth ?? range / 2)));
  const muffle = options.muffle === undefined ? DEFAULT_MUFFLE : options.muffle;
  const k = Math.min(1, d / range);
  const cutoffHz = muffle ? muffle[0] * Math.pow(muffle[1] / muffle[0], k) : 20000;
  if (d >= range) return { audible: false, gain: 0, pan, cutoffHz };
  return { audible: true, gain: Math.pow(1 - k, options.rolloff ?? 1.5), pan, cutoffHz };
}

export interface EmitterOptions extends SpatialMixOptions {
  /** 0–1 (default 1). */
  volume?: number;
  /** Plays on for good (default true); a one-shot ends by itself. */
  loop?: boolean;
  playbackRate?: number;
}

/** A sound placed in the world by `SpatialAudio`. */
export interface SpatialEmitter {
  x: number;
  y: number;
  volume: number;
  /** Playing now: false while out of range (a loop waits silent), and for good once stopped or ended. */
  readonly playing: boolean;
  readonly done: boolean;
  stop(fadeMs?: number): void;
}

/** Seconds a change of gain, pan or cutoff eases over: a step change on a moving source clicks. */
const SMOOTH = 0.05;

/**
 * Sounds placed in the world, heard from a listener that moves: a waterfall, a campfire, a machine humming, or a
 * one-shot at a spot. Each emitter is panned to its side, fades with distance and loses its highs far away
 * (`spatialMix`), eased each `update` so a moving source does not click. A loop out of range stops its source to
 * save the voice and starts again at the point it would have reached, so it seems to have played on.
 *
 * ```ts
 * const world = new SpatialAudio(audioContext);
 * const falls = world.emitter(fallsBuffer, 320, 96, { range: 400, volume: 0.6 });
 * // each frame: world.update(hero);
 * ```
 */
export class SpatialAudio {
  /** Every emitter's gain goes through this: the game's volume setting. */
  readonly output: GainNode;
  private readonly emitters = new Set<Emitter>();
  private here: Point = { x: 0, y: 0 };

  constructor(
    readonly context: BaseAudioContext,
    destination: AudioNode = context.destination,
  ) {
    this.output = context.createGain();
    this.output.connect(destination);
  }

  /** The listener's place as of the last `update`. */
  get listener(): Point {
    return this.here;
  }

  /** How many emitters are alive (playing or waiting out of range). */
  get size(): number {
    return this.emitters.size;
  }

  /** A sound at (x, y), looping by default. Starts at once when in range of the listener. */
  emitter(buffer: AudioBuffer, x: number, y: number, options: EmitterOptions = {}): SpatialEmitter {
    const e = new Emitter(this, buffer, x, y, options);
    this.emitters.add(e);
    e.refresh(this.here, false);
    return e;
  }

  /** A one-shot at (x, y), dropped when it ends; skipped (and done at once) when out of range. */
  play(buffer: AudioBuffer, x: number, y: number, options: Omit<EmitterOptions, 'loop'> = {}): SpatialEmitter {
    return this.emitter(buffer, x, y, { ...options, loop: false });
  }

  /** Moves the listener and re-mixes every emitter. Call once a frame. */
  update(listener: Point = this.here): void {
    this.here = { x: listener.x, y: listener.y };
    for (const e of this.emitters) e.refresh(this.here, true);
  }

  /** Stops every emitter. */
  stopAll(fadeMs = 0): void {
    for (const e of [...this.emitters]) e.stop(fadeMs);
  }

  destroy(): void {
    this.stopAll();
    this.output.disconnect();
  }

  /** @internal */
  forget(e: Emitter): void {
    this.emitters.delete(e);
  }
}

class Emitter implements SpatialEmitter {
  volume: number;
  done = false;
  private source: AudioBufferSourceNode | null = null;
  private readonly gain: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly filter: BiquadFilterNode;
  /** When the loop would have begun, had it never stopped: where a restart picks it up. */
  private readonly origin: number;
  private readonly rate: number;

  constructor(
    private readonly owner: SpatialAudio,
    private readonly buffer: AudioBuffer,
    public x: number,
    public y: number,
    private readonly options: EmitterOptions,
  ) {
    const ctx = owner.context;
    this.volume = options.volume ?? 1;
    this.rate = options.playbackRate ?? 1;
    this.origin = ctx.currentTime;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.gain = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.filter.connect(this.gain).connect(this.panner).connect(owner.output);
  }

  get playing(): boolean {
    return this.source !== null;
  }

  refresh(listener: Point, smooth: boolean): void {
    if (this.done) return;
    const mix = spatialMix(listener, this, this.options);
    const loop = this.options.loop ?? true;
    if (!mix.audible) {
      if (!loop) return this.stop();
      this.halt();
      return;
    }
    const ctx = this.owner.context;
    const t = ctx.currentTime;
    const set = (param: AudioParam, v: number) => (smooth && this.source ? param.setTargetAtTime(v, t, SMOOTH) : param.setValueAtTime(v, t));
    set(this.gain.gain, mix.gain * Math.max(0, Math.min(1, this.volume)));
    set(this.panner.pan, mix.pan);
    set(this.filter.frequency, Math.min(mix.cutoffHz, ctx.sampleRate / 2));
    if (!this.source) this.begin(loop);
  }

  stop(fadeMs = 0): void {
    if (this.done) return;
    this.done = true;
    this.owner.forget(this);
    const src = this.source;
    const ctx = this.owner.context;
    if (src && fadeMs > 0) {
      const end = ctx.currentTime + fadeMs / 1000;
      this.gain.gain.setValueAtTime(this.gain.gain.value, ctx.currentTime);
      this.gain.gain.linearRampToValueAtTime(0, end);
      src.stop(end);
      src.onended = () => this.release();
    } else {
      this.halt();
      this.release();
    }
  }

  private begin(loop: boolean): void {
    const ctx = this.owner.context;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = loop;
    src.playbackRate.value = this.rate;
    src.connect(this.filter);
    // a loop picks up where it would be had it played all along
    const offset = loop ? ((ctx.currentTime - this.origin) * this.rate) % this.buffer.duration : 0;
    src.start(ctx.currentTime, offset);
    if (!loop) src.onended = () => this.stop();
    this.source = src;
  }

  private halt(): void {
    const src = this.source;
    if (!src) return;
    this.source = null;
    src.onended = null;
    try {
      src.stop();
    } catch {
      // never started: nothing to stop
    }
    src.disconnect();
  }

  private release(): void {
    this.filter.disconnect();
    this.gain.disconnect();
    this.panner.disconnect();
  }
}
