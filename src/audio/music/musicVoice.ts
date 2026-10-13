/**
 * One looping track playing on one channel of `MusicPlayer`, with a volume that can be set and faded. Two ways to get
 * one: `ElementVoice` (the `<audio>` element's own volume) and `GraphVoice` (the element routed through a Web Audio
 * gain, for where an `<audio>`'s `volume` is read-only: iOS).
 */
export interface MusicVoice {
  readonly el: HTMLAudioElement;
  /** The volume now (0..1). */
  level(): number;
  /** Sets it at once, cancelling a fade in flight. */
  set(level: number): void;
  /** Fades to `level` over `ms`; `done` runs at the end (not if a later fade or `set` takes over). */
  fade(level: number, ms: number, done?: () => void): void;
  /** A fade is in flight: the channel leaves the volume setting alone until it ends. */
  readonly busy: boolean;
  /** Stops the sound and lets the element go. */
  dispose(): void;
}

/**
 * True where an `<audio>` ignores `volume` (iOS WebKit), so music has to go through Web Audio to be faded at all.
 * Newer iOS reads a set volume back while the speaker ignores it, so the probe alone misses it: an iPhone, iPod or an
 * iPad posing as a Mac is named first.
 */
export function elementVolumeLocked(): boolean {
  if (typeof Audio === 'undefined') return false;
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (nav && (/iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1))) return true;
  const probe = new Audio();
  probe.volume = 0.5;
  return Math.abs(probe.volume - 0.5) > 0.01;
}

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
