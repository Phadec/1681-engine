/*
 * A WebGL context can be taken away at any time: a phone's GPU resetting, a driver crash, an Android WebView taking
 * the GPU back from an app in the background. Pixi does not rebuild a lost world by itself, so the game must — and a
 * GPU that keeps dropping it will not be saved by another try, so after a few losses in a short while it should stop
 * and say so instead of rebuilding forever.
 */

export interface ContextLossPolicy {
  /** Losses tolerated inside `windowMs` before giving up (default 3). */
  maxLosses?: number;
  /** How far back losses are counted, ms (default two minutes). */
  windowMs?: number;
}

export interface ContextLossVerdict {
  /** The losses still inside the window, this one included (unless the page was hidden). */
  losses: number[];
  /** Stop rebuilding: the GPU keeps failing. */
  giveUp: boolean;
  /** How long to wait before rebuilding (`rebuildDelayMs`). */
  delayMs: number;
}

/**
 * One more context loss at `now`, given the earlier ones. A loss while the page is `hidden` is the system taking the
 * GPU back, not the GPU failing, so it is not counted against it.
 */
export function noteContextLoss(earlier: readonly number[], now: number, hidden = false, policy: ContextLossPolicy = {}): ContextLossVerdict {
  const { maxLosses = 3, windowMs = 120_000 } = policy;
  const kept = earlier.filter((t) => now - t < windowMs);
  const losses = hidden ? kept : kept.concat(now);
  return { losses, giveUp: losses.length > maxLosses, delayMs: rebuildDelayMs(losses.length) };
}

/**
 * How long to wait before rebuilding after a loss, with `losses` counted in the window: a GPU that has just reset is
 * given longer each time it drops the context again (a rebuild at once was dropped at once on a phone).
 */
export function rebuildDelayMs(losses: number): number {
  return losses <= 1 ? 250 : losses === 2 ? 2_000 : 5_000;
}

/**
 * Calls `onLost` with a verdict each time `canvas` (the renderer's) loses its WebGL context; the game tears its world
 * down and rebuilds it after `delayMs`, or shows an error when `giveUp`. The event's default is prevented, which is
 * what lets the browser restore the context at all. Returns the uninstall.
 */
export function watchContextLoss(
  canvas: EventTarget,
  onLost: (verdict: ContextLossVerdict) => void,
  options: ContextLossPolicy & { onRestored?: () => void; now?: () => number; hidden?: () => boolean } = {},
): () => void {
  const now = options.now ?? (() => performance.now());
  const hidden = options.hidden ?? (() => typeof document !== 'undefined' && document.hidden);
  let losses: number[] = [];
  const lost = (e: Event) => {
    e.preventDefault();
    const verdict = noteContextLoss(losses, now(), hidden(), options);
    losses = verdict.losses;
    onLost(verdict);
  };
  const restored = () => options.onRestored?.();
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return () => {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
  };
}
