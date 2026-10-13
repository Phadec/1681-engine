import { clamp01, type MusicVoice } from './musicVoice';

/** A track on the `<audio>` element's own volume, faded frame by frame: nothing between the file and the speaker. */
export class ElementVoice implements MusicVoice {
  private fading: number | null = null;

  constructor(readonly el: HTMLAudioElement) {}

  level(): number {
    return this.el.volume;
  }

  set(level: number): void {
    this.stopFade();
    this.el.volume = clamp01(level);
  }

  fade(to: number, ms: number, done?: () => void): void {
    this.stopFade();
    const from = this.el.volume;
    const start = performance.now();
    const step = () => {
      const k = ms > 0 ? Math.min(1, (performance.now() - start) / ms) : 1;
      this.el.volume = clamp01(from + (to - from) * k);
      if (k < 1) this.fading = requestAnimationFrame(step);
      else {
        this.fading = null;
        done?.();
      }
    };
    this.fading = requestAnimationFrame(step);
  }

  get busy(): boolean {
    return this.fading !== null;
  }

  dispose(): void {
    this.stopFade();
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
  }

  private stopFade(): void {
    if (this.fading !== null) cancelAnimationFrame(this.fading);
    this.fading = null;
  }
}
