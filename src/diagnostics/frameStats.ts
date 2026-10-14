/** A summary of the frames of one sampling window. */
export interface FrameSummary {
  /** Frames rendered. */
  frames: number;
  /** Frames a second over the window. */
  fps: number;
  /** The "1% low": the frame rate of the slowest hundredth of frames, which is what stutter feels like. */
  fpsLow: number;
  /** The 95th-percentile frame time, ms. */
  frameP95: number;
  /** The median frame time, ms. */
  frameMedian: number;
  /** The longest frame, ms. */
  worstMs: number;
  /** Frames longer than the hitch threshold: the ones a player feels. */
  hitches: number;
}

/** The value at fraction `p` (0..1) of an ascending list, by nearest rank; 0 for an empty list. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))]!;
}

/** Frames longer than `thresholdMs`. */
export function countHitches(frameMs: readonly number[], thresholdMs: number): number {
  let n = 0;
  for (const d of frameMs) if (d > thresholdMs) n++;
  return n;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The summary of frame times (ms) rendered over `spanMs`; a frame over `hitchMs` (default 50) is a hitch. */
export function summarizeFrames(frameMs: readonly number[], spanMs: number, hitchMs = 50): FrameSummary {
  const sorted = [...frameMs].sort((a, b) => a - b);
  return {
    frames: frameMs.length,
    fps: spanMs > 0 ? round1((frameMs.length * 1000) / spanMs) : 0,
    fpsLow: round1(1000 / Math.max(1, percentile(sorted, 0.99))),
    frameP95: round1(percentile(sorted, 0.95)),
    frameMedian: round1(percentile(sorted, 0.5)),
    worstMs: round1(sorted[sorted.length - 1] ?? 0),
    hitches: countHitches(frameMs, hitchMs),
  };
}

/**
 * A window the browser throttled: one covered by another window is not `hidden`, but runs at about a frame a second,
 * and a second copy of a game parked behind the first read as its heaviest scene. Nothing really played runs with
 * its median frame half a second long.
 */
export function looksThrottled(summary: FrameSummary, medianLimitMs = 500): boolean {
  return summary.frameMedian > medianLimitMs;
}
