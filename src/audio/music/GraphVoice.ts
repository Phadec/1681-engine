import { clamp01, type MusicVoice } from './musicVoice';

/**
 * A track routed `<audio>` → MediaElementSource → gain → speakers, so its volume and crossfades work where the
 * element's own `volume` is read-only (iOS). The fade is scheduled on the audio clock (a ramp), so it runs even while
 * the page draws no frames. A cross-origin file without CORS headers plays silent this way: serve music from the
 * game's own origin, or keep `ElementVoice` where volume works.
 */
export class GraphVoice implements MusicVoice {
  private readonly gain: GainNode;
  private readonly source: MediaElementAudioSourceNode;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly el: HTMLAudioElement,
    private readonly graph: AudioContext,
  ) {
    this.source = graph.createMediaElementSource(el);
    this.gain = graph.createGain();
    this.gain.gain.value = 0;
    this.source.connect(this.gain).connect(graph.destination);
  }

  level(): number {
    return this.gain.gain.value;
  }

  set(level: number): void {
    this.stopFade();
    const g = this.gain.gain;
    g.cancelScheduledValues(this.graph.currentTime);
    g.setValueAtTime(clamp01(level), this.graph.currentTime);
  }

  fade(to: number, ms: number, done?: () => void): void {
    this.stopFade();
    const g = this.gain.gain;
    const now = this.graph.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(clamp01(to), now + ms / 1000);
    this.timer = setTimeout(() => {
      this.timer = null;
      done?.();
    }, ms);
  }

  get busy(): boolean {
    return this.timer !== null;
  }

  dispose(): void {
    this.stopFade();
    this.el.pause();
    this.source.disconnect();
    this.gain.disconnect();
  }

  private stopFade(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
