import { engineSettings } from '../settings';

export interface PlayOptions {
  /** Crossfade from what is playing, ms (default 1200). */
  fadeMs?: number;
  /** Start over at the end (default true). */
  loop?: boolean;
  /** This track's own level, 0–1, under the music volume (default 1). */
  volume?: number;
}

/** One playing track: an `<audio>` element, routed through a gain when Web Audio is there. */
interface Track {
  url: string;
  el: HTMLAudioElement;
  gain: GainNode | null;
  level: number;
  /** Fade from `from` to `to` between `start` and `start + ms` (performance.now()). */
  fade: { from: number; to: number; start: number; ms: number };
  dying: boolean;
}

/**
 * Background music: one track at a time, crossfaded when it changes, looping, at `engineSettings.musicVolume`.
 * Tracks stream through `<audio>` elements (no decoding a whole song into memory). Where Web Audio exists their level
 * is a gain node, since iOS ignores an element's own `volume`.
 *
 * Browsers start sound only after a user gesture: `play` before one is remembered and starts on the first tap or key.
 *
 * ```ts
 * music.play('music/forest.ogg');
 * music.play('music/boss.ogg', { fadeMs: 600 }); // crossfades
 * music.stop(2000);
 * ```
 */
export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly tracks: Track[] = [];
  private raf = 0;
  private unlocked = false;
  private readonly cleanup: (() => void)[] = [];

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.unlocked = true;
      void this.ctx?.resume();
      for (const t of this.tracks) if (!t.dying && t.el.paused) void t.el.play().catch(() => {});
    };
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) {
      window.addEventListener(type, unlock, { passive: true });
      this.cleanup.push(() => window.removeEventListener(type, unlock));
    }
    this.cleanup.push(engineSettings.subscribe(() => this.applyVolume()));
  }

  /** The url of the track playing (or fading in), if any. */
  get current(): string | null {
    for (let i = this.tracks.length - 1; i >= 0; i--) if (!this.tracks[i]!.dying) return this.tracks[i]!.url;
    return null;
  }

  /** Plays `url`, crossfading from what plays now. The track already playing is left alone. */
  play(url: string, options: PlayOptions = {}): void {
    if (typeof Audio === 'undefined') return;
    if (this.current === url) return;
    const fadeMs = Math.max(0, options.fadeMs ?? 1200);
    this.fadeOutAll(fadeMs);
    const el = new Audio(url);
    el.loop = options.loop !== false;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    const track: Track = { url, el, gain: null, level: Math.min(1, Math.max(0, options.volume ?? 1)), fade: { from: 0, to: 1, start: performance.now(), ms: fadeMs }, dying: false };
    const ctx = this.context();
    if (ctx && this.master) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain).connect(this.master);
      track.gain = gain;
    } else {
      el.volume = 0;
    }
    this.tracks.push(track);
    if (this.unlocked || !this.needsGesture()) void el.play().catch(() => {});
    this.tick();
  }

  /** Fades the music out and stops it. */
  stop(fadeMs = 1200): void {
    this.fadeOutAll(Math.max(0, fadeMs));
    this.tick();
  }

  pause(): void {
    for (const t of this.tracks) t.el.pause();
  }

  resume(): void {
    for (const t of this.tracks) if (!t.dying) void t.el.play().catch(() => {});
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanup.splice(0)) fn();
    for (const t of this.tracks.splice(0)) this.release(t);
    void this.ctx?.close();
    this.ctx = null;
  }

  private fadeOutAll(ms: number): void {
    const now = performance.now();
    for (const t of this.tracks) {
      if (t.dying) continue;
      t.fade = { from: fadeValue(t.fade, now), to: 0, start: now, ms };
      t.dying = true;
    }
  }

  /** Runs the fades a frame at a time until none is left. */
  private tick = (): void => {
    cancelAnimationFrame(this.raf);
    const now = performance.now();
    let busy = false;
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const t = this.tracks[i]!;
      const v = fadeValue(t.fade, now);
      if (t.dying && v <= 0) {
        this.release(t);
        this.tracks.splice(i, 1);
        continue;
      }
      this.setLevel(t, v);
      if (now < t.fade.start + t.fade.ms) busy = true;
    }
    if (busy) this.raf = requestAnimationFrame(this.tick);
  };

  private applyVolume(): void {
    const now = performance.now();
    for (const t of this.tracks) this.setLevel(t, fadeValue(t.fade, now));
  }

  private setLevel(t: Track, fade: number): void {
    const v = Math.min(1, Math.max(0, fade * t.level * engineSettings.getState().musicVolume));
    if (t.gain) t.gain.gain.value = v;
    else t.el.volume = v;
  }

  private release(t: Track): void {
    t.el.pause();
    t.el.removeAttribute('src');
    t.el.load();
    t.gain?.disconnect();
  }

  private needsGesture(): boolean {
    return this.ctx?.state === 'suspended';
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }
}

/** A fade's value at `now`: linear from `from` to `to` over `ms`. */
export function fadeValue(f: { from: number; to: number; start: number; ms: number }, now: number): number {
  if (f.ms <= 0 || now >= f.start + f.ms) return f.to;
  if (now <= f.start) return f.from;
  return f.from + ((f.to - f.from) * (now - f.start)) / f.ms;
}

/** The shared music player. */
export const music = new MusicPlayer();
