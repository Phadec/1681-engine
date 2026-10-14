/**
 * An `AbortSignal` that aborts after `ms` — `AbortSignal.timeout`, which iOS Safari only has from 16 and older
 * WebViews not at all: there an `AbortController` and a timer stand in, aborting with the same `TimeoutError`.
 */
export function timeoutSignal(ms: number): AbortSignal {
  const native = (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout;
  if (typeof native === 'function') return native.call(AbortSignal, ms);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(timeoutError()), ms);
  // a timer left in the event loop would keep a Node process alive for a signal nobody waits on any more
  (timer as { unref?: () => void }).unref?.();
  return controller.signal;
}

function timeoutError(): Error {
  if (typeof DOMException === 'function') return new DOMException('The operation timed out.', 'TimeoutError');
  const err = new Error('The operation timed out.');
  err.name = 'TimeoutError';
  return err;
}
