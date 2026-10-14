import { Stage } from '../core/Stage';
import { ErrorDeduper, trimStack } from './ErrorDeduper';

/** One error, as handed to `captureErrors`' callback. */
export interface CapturedError {
  message: string;
  /** The first lines of its stack, or ''. */
  stack: string;
  /** `uncaught`, `rejection`, or `frame` for one a `Stage` step caught so the frame could go on. */
  source: 'uncaught' | 'rejection' | 'frame';
}

export interface CaptureErrorsOptions {
  /** Distinct errors reported in all (default 10). */
  max?: number;
  /** Also report what a `Stage` frame caught (`Stage.onCaught`; default true): there a fault shows only as a stuck view. */
  frames?: boolean;
  /** Shared with the game's own reports (`admit` before sending), so one error is not told twice. */
  deduper?: ErrorDeduper;
}

/**
 * Hands every error nothing else caught — `error` and `unhandledrejection` on the window, and what a frame caught —
 * to `onError`, each distinct one once. The engine sends nothing itself; reporting it is the game's. Returns the
 * uninstall, which puts back whatever held `Stage.onCaught` before.
 */
export function captureErrors(onError: (e: CapturedError) => void, options: CaptureErrorsOptions = {}): () => void {
  const dedupe = options.deduper ?? new ErrorDeduper(options.max ?? 10);
  const report = (message: string, stack: string | undefined, source: CapturedError['source']) => {
    const key = dedupe.admit(message);
    if (key !== null) onError({ message: key, stack: trimStack(stack), source });
  };
  const onWindowError = (e: ErrorEvent) => report(e.message || String(e.error), (e.error as { stack?: string } | undefined)?.stack, 'uncaught');
  const onRejection = (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    report(r?.message ?? String(e.reason), r?.stack, 'rejection');
  };
  const onCaught = (where: string, err: unknown) => {
    const e = err as { message?: string; stack?: string } | undefined;
    report(`${where}: ${e?.message ?? String(err)}`, e?.stack, 'frame');
  };
  const win = typeof window !== 'undefined' ? window : undefined;
  win?.addEventListener('error', onWindowError);
  win?.addEventListener('unhandledrejection', onRejection);
  const previous = Stage.onCaught;
  if (options.frames !== false) {
    Stage.onCaught = (where, err) => {
      previous?.(where, err);
      onCaught(where, err);
    };
  }
  const installed = Stage.onCaught;
  return () => {
    win?.removeEventListener('error', onWindowError);
    win?.removeEventListener('unhandledrejection', onRejection);
    if (options.frames !== false && Stage.onCaught === installed) Stage.onCaught = previous;
  };
}
