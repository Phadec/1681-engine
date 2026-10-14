import { Container } from 'pixi.js';
import type { Engine } from '../engine/Engine';
import type { Scene } from '../engine/Scene';
import type { Transition, TransitionContext } from './Transition';

/** How the scene stack changes under the transition. */
export type TransitionMode = 'replace' | 'push' | 'pop';

/** Transitions running per engine, so a second one waits for the first instead of drawing over it. */
const running = new WeakMap<Engine, Promise<void>>();

/**
 * Changes scene behind a transition: covers the screen, runs `engine.scenes.replace(next)` (or `push`, or `pop`, for
 * which `next` is ignored) — waiting out an async `onEnter` while covered — then reveals. Resolves when the reveal
 * ends. The overlay is removed and the transition disposed even when the scene change throws, which is re-thrown.
 *
 * ```ts
 * await transitionTo(engine, new Level2(), new FadeTransition({ duration: 250 }));
 * ```
 */
export function transitionTo(engine: Engine, next: Scene | null, transition: Transition, mode: TransitionMode = 'replace'): Promise<void> {
  const before = running.get(engine) ?? Promise.resolve();
  const job = before.then(() => run(engine, next, transition, mode));
  const tail = job.catch(() => undefined);
  running.set(engine, tail);
  void tail.then(() => {
    if (running.get(engine) === tail) running.delete(engine);
  });
  return job;
}

async function run(engine: Engine, next: Scene | null, transition: Transition, mode: TransitionMode): Promise<void> {
  const layer = new Container();
  // over the screen layer, so it covers every scene's HUD too, including the HUD the next scene is about to add
  engine.app.stage.addChild(layer);
  const ctx: TransitionContext = { stage: engine.stage, app: engine.app, layer };
  try {
    await transition.cover(ctx);
    if (mode === 'pop') await engine.scenes.pop();
    else {
      if (!next) throw new Error(`transitionTo: '${mode}' needs a scene`);
      await (mode === 'push' ? engine.scenes.push(next) : engine.scenes.replace(next));
    }
    await transition.reveal(ctx);
  } finally {
    transition.dispose();
    layer.destroy({ children: true });
  }
}
