import type { MusicVoice } from './musicVoice';

export interface PlayOptions {
  /** Crossfade from what this channel plays now, ms (default 1200). */
  fadeMs?: number;
  /** Start over at the end (default true). */
  loop?: boolean;
  /** This track's own level, 0–1, under the music volume (default 1). */
  volume?: number;
}

/**
 * One layer of music (the score, a place's ambience…): one looping track at a time, crossfaded when it changes, at
 * its own level under the player's music volume.
 */
export class MusicChannel {
  private voice: MusicVoice | null = null;
  private url: string | null = null;
  private level = 1;

  constructor(
    private readonly volume: () => number,
    private readonly makeVoice: (el: HTMLAudioElement) => MusicVoice,
  ) {}

  /** The url of the track playing (or fading in), if any. */
  get current(): string | null {
    return this.url;
  }

  /** Plays `url`, crossfading from what plays now; the track already playing only takes the new `volume`. */
  play(url: string, options: PlayOptions = {}): void {
    const level = Math.min(1, Math.max(0, options.volume ?? 1));
    if (url === this.url) {
      if (level !== this.level) {
        this.level = level;
        this.refresh();
      }
      return;
    }
    if (typeof Audio === 'undefined') return;
    const fadeMs = Math.max(0, options.fadeMs ?? 1200);
    this.fadeOut(fadeMs);
    this.url = url;
    this.level = level;
    const el = new Audio(url);
    el.loop = options.loop !== false;
    el.preload = 'auto';
    const voice = this.makeVoice(el);
    voice.set(0);
    this.voice = voice;
    void el.play().catch(() => {
      // refused until the first gesture; the player's unlock retries it
    });
    voice.fade(this.target(), fadeMs);
  }

  /** Fades this channel out and stops it. */
  stop(fadeMs = 1200): void {
    this.fadeOut(Math.max(0, fadeMs));
    this.url = null;
  }

  /** Retries a start the browser refused, and follows the music volume. */
  refresh(): void {
    const v = this.voice;
    if (!v) return;
    if (v.el.paused) void v.el.play().catch(() => {});
    if (!v.busy) v.set(this.target());
  }

  /** Stops where it is (the app went to the background); `refresh` picks it up again. */
  pause(): void {
    this.voice?.el.pause();
  }

  dispose(): void {
    this.voice?.dispose();
    this.voice = null;
    this.url = null;
  }

  private target(): number {
    return Math.max(0, Math.min(1, this.volume() * this.level));
  }

  private fadeOut(ms: number): void {
    const old = this.voice;
    this.voice = null;
    if (old) old.fade(0, ms, () => old.dispose());
  }
}
