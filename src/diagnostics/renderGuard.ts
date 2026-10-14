import { type Application, UPDATE_PRIORITY } from 'pixi.js';

/** An error as one short line, for a player's screenshot or a report. */
export function describeError(err: unknown, max = 160): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Replaces Pixi's render on the ticker with one that survives a throw and reports a renderer that keeps failing.
 * A ticker listener that throws never asks for the next frame, and `Stage`'s per-step guard covers the game's steps,
 * not the renderer's: a render that threw on its first frame froze the canvas in silence while the page went on.
 * A single bad frame is let go; `failures` in a row are reported once. Returns the uninstall, which puts Pixi's own
 * render back.
 */
export function guardRender(app: Application, onFail: (detail: string, err: unknown) => void, failures = 30): () => void {
  app.ticker.remove(app.render, app);
  let inARow = 0;
  let told = false;
  const render = () => {
    try {
      app.render();
      inARow = 0;
    } catch (err) {
      inARow++;
      if (inARow === 1) console.error('[render] frame failed', err);
      if (inARow >= failures && !told) {
        told = true;
        onFail(`render: ${describeError(err)}`, err);
      }
    }
  };
  app.ticker.add(render, undefined, UPDATE_PRIORITY.LOW);
  return () => {
    app.ticker.remove(render);
    app.ticker.add(app.render, app, UPDATE_PRIORITY.LOW);
  };
}
