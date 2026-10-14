import type { PaintedPixels, Painter } from './Prepainter';

/** What the worker posts back for one request: the painted pixels (the buffer transferred), or why it could not. */
export type PaintReply = { id: string } & (PaintedPixels | { error: string });

export interface WorkerPainterOptions<T> {
  /** Makes the worker, the first time something is painted: `() => new Worker(new URL('./paint.ts', import.meta.url), { type: 'module' })`. */
  create: () => Worker;
  /** The message posted for an item (default `{ id, item }`); the worker answers with a `PaintReply` naming that id. */
  message?: (item: T, id: string) => unknown;
}

/**
 * A `Painter` that paints in a worker. The worker answers each request with a `PaintReply` carrying the request's id,
 * transferring the pixel buffer (`postMessage(reply, { transfer: [reply.pixels] })`) so nothing is copied back. A
 * worker that cannot start or fails rejects everything under way and everything after: a prepainter then simply
 * paints nothing ahead.
 */
export function workerPainter<T>(options: WorkerPainterOptions<T>): Painter<T> {
  /** undefined: not started yet; null: unavailable or disposed. */
  let worker: Worker | null | undefined;
  const waiting = new Map<string, { resolve: (p: PaintedPixels) => void; reject: (e: Error) => void }[]>();

  const failAll = (why: string) => {
    worker?.terminate();
    worker = null;
    for (const list of waiting.values()) for (const w of list) w.reject(new Error(why));
    waiting.clear();
  };

  const start = (): Worker | null => {
    if (worker !== undefined) return worker;
    try {
      const w = options.create();
      w.onmessage = (e: MessageEvent<PaintReply>) => {
        const reply = e.data;
        const list = waiting.get(reply.id);
        if (!list) return;
        waiting.delete(reply.id);
        for (const one of list) {
          if ('error' in reply) one.reject(new Error(reply.error));
          else one.resolve(reply);
        }
      };
      w.onerror = () => failAll('the painter worker failed');
      worker = w;
    } catch {
      worker = null;
    }
    return worker;
  };

  return {
    paint(item, id) {
      const w = start();
      if (!w) return Promise.reject(new Error('no painter worker'));
      return new Promise<PaintedPixels>((resolve, reject) => {
        const list = waiting.get(id);
        if (list) list.push({ resolve, reject });
        else {
          waiting.set(id, [{ resolve, reject }]);
          w.postMessage(options.message ? options.message(item, id) : { id, item });
        }
      });
    },
    dispose() {
      failAll('disposed');
    },
  };
}
