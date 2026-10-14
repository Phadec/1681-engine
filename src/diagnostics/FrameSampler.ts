import { type Ticker, UPDATE_PRIORITY } from 'pixi.js';
import { looksThrottled, summarizeFrames, type FrameSummary } from './frameStats';

export interface FrameSamplerOptions {
  /** How long one sample spans, ms (default a minute). */
  windowMs?: number;
  /** A frame longer than this is a hitch, ms (default 50). */
  hitchMs?: number;
  /** Fewer frames than this in a window is no sample (default 30). */
  minFrames?: number;
  /** A window whose median frame is over this came from a throttled background window and is dropped (default 500). */
  throttledMedianMs?: number;
  /** Frames are not counted while this says so (default: the page is hidden). */
  paused?: () => boolean;
  now?: () => number;
}

/**
 * Measures how a game really runs on a player's device: each frame costs one number pushed on an array, and every
 * `windowMs` the window is summed into a `FrameSummary` handed to `onSample` — FPS, the 1% low, the 95th-percentile
 * frame, hitches. The engine sends nothing anywhere: what the game does with a sample (a readout, a report to its
 * server) is the callback's.
 */
export class FrameSampler {
  private frames: number[] = [];
  private since: number;
  private readonly opts: Required<Omit<FrameSamplerOptions, 'paused' | 'now'>>;
  private readonly paused: () => boolean;
  private readonly now: () => number;

  constructor(private readonly onSample: (summary: FrameSummary) => void, options: FrameSamplerOptions = {}) {
    this.opts = {
      windowMs: options.windowMs ?? 60_000,
      hitchMs: options.hitchMs ?? 50,
      minFrames: options.minFrames ?? 30,
      throttledMedianMs: options.throttledMedianMs ?? 500,
    };
    this.paused = options.paused ?? (() => typeof document !== 'undefined' && document.hidden);
    this.now = options.now ?? (() => performance.now());
    this.since = this.now();
  }

  /** One frame of `deltaMs`; sums the window once it is full. */
  push(deltaMs: number): void {
    if (this.paused()) return;
    this.frames.push(deltaMs);
    const now = this.now();
    const span = now - this.since;
    if (span < this.opts.windowMs) return;
    const sample = this.frames;
    this.frames = [];
    this.since = now;
    if (sample.length < this.opts.minFrames) return;
    const summary = summarizeFrames(sample, span, this.opts.hitchMs);
    if (looksThrottled(summary, this.opts.throttledMedianMs)) return;
    this.onSample(summary);
  }

  /** Starts a fresh window, dropping what was counted (after a scene change, say). */
  reset(): void {
    this.frames = [];
    this.since = this.now();
  }

  /** Feeds the sampler from a Pixi ticker, after the render; returns the detach. */
  attach(ticker: Ticker): () => void {
    const tick = () => this.push(ticker.deltaMS);
    ticker.add(tick, undefined, UPDATE_PRIORITY.UTILITY);
    return () => ticker.remove(tick);
  }
}
