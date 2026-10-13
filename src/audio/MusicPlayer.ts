import { engineSettings } from '../settings';
import { isTouchUi } from '../platform/touch';
import { ElementVoice } from './music/ElementVoice';
import { GraphVoice } from './music/GraphVoice';
import { MusicChannel, type PlayOptions } from './music/MusicChannel';
import { elementVolumeLocked, type MusicVoice } from './music/musicVoice';

export type { PlayOptions } from './music/MusicChannel';

/**
 * How music reaches the speaker: `'element'` on the `<audio>` element's own volume (nothing in between; a file from
 * another origin plays as it is), `'graph'` through a Web Audio gain (the only way where that volume is read-only),
 * `'auto'` (default) the graph only where it has to be (iOS).
 */
export type MusicRoute = 'auto' | 'element' | 'graph';

export interface MusicOptions {
  route?: MusicRoute;
  /** Stop the music while the page is hidden (an app sent to the background). Default: on touch devices. */
  pauseInBackground?: boolean;
}

/**
 * Background music in layers: each named channel (`'music'` by default, `'ambience'`, any other) plays one looping
 * track at a time, crossfaded when it changes, all at `engineSettings.musicVolume`. Tracks stream through `<audio>`
 * elements (no decoding a whole song into memory).
 *
 * Browsers start sound only after a user gesture: a track played before one starts on the first tap or key. On iOS the
 * graph's context is woken inside that gesture too, and again after the app comes back from the background.
 *
 * ```ts
 * music.play('music/forest.ogg');                                     // the 'music' channel
 * music.channel('ambience').play('amb/wind.ogg', { volume: 0.5 });     // a second layer under it
 * music.play('music/boss.ogg', { fadeMs: 600 });                      // crossfades the first only
 * music.stop(2000);
 * ```
 */
export class MusicPlayer {
  private readonly channels = new Map<string, MusicChannel>();
  private route: MusicRoute = 'auto';
  private graph: AudioContext | null = null;
  private graphLocked: boolean | null = null;
  private pauseInBackground: boolean | null = null;
  private installed = false;

  /** Picks the route and background behaviour; call before the first track for the route to apply to every track. */
  configure(options: MusicOptions): this {
    if (options.route) this.route = options.route;
    if (options.pauseInBackground !== undefined) this.pauseInBackground = options.pauseInBackground;
    return this;
  }

  /** The channel named `name`, made on first use. */
  channel(name = 'music'): MusicChannel {
    let ch = this.channels.get(name);
    if (!ch) {
      this.install();
      ch = new MusicChannel(() => engineSettings.getState().musicVolume, (el) => this.voiceFor(el));
      this.channels.set(name, ch);
    }
    return ch;
  }

  /** The url the `'music'` channel plays, if any. */
  get current(): string | null {
    return this.channels.get('music')?.current ?? null;
  }

  /** Plays `url` on the `'music'` channel. */
  play(url: string, options?: PlayOptions): void {
    this.channel().play(url, options);
  }

  /** Fades every channel out. */
  stop(fadeMs = 1200): void {
    for (const ch of this.channels.values()) ch.stop(fadeMs);
  }

  pause(): void {
    for (const ch of this.channels.values()) ch.pause();
  }

  resume(): void {
    this.wake();
  }

  destroy(): void {
    for (const ch of this.channels.values()) ch.dispose();
    this.channels.clear();
    void this.graph?.close();
    this.graph = null;
  }

  private voiceFor(el: HTMLAudioElement): MusicVoice {
    const graph = this.throughGraph() ? this.context() : null;
    return graph ? new GraphVoice(el, graph) : new ElementVoice(el);
  }

  private throughGraph(): boolean {
    if (this.route !== 'auto') return this.route === 'graph';
    return (this.graphLocked ??= elementVolumeLocked());
  }

  private context(): AudioContext | null {
    if (this.graph) return this.graph;
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.graph = new Ctor();
    return this.graph;
  }

  /** Retries every refused start and follows the volume; the graph's context resumes inside the gesture that called it. */
  private wake(): void {
    if (this.graph && this.graph.state !== 'running') void this.graph.resume().catch(() => {});
    if (typeof document !== 'undefined' && document.hidden) return;
    for (const ch of this.channels.values()) ch.refresh();
  }

  private install(): void {
    if (this.installed || typeof window === 'undefined') return;
    this.installed = true;
    const wake = () => this.wake();
    // `touchend` is the gesture iOS accepts for starting media; the others are the desktop's
    for (const type of ['pointerdown', 'touchend', 'keydown'] as const) window.addEventListener(type, wake, { capture: true });
    engineSettings.subscribe(wake);
    document.addEventListener('visibilitychange', () => {
      if (!(this.pauseInBackground ?? isTouchUi())) return;
      if (document.hidden) this.pause();
      else wake();
    });
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
