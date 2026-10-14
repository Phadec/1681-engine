import type { Application, Container } from 'pixi.js';
import type { Stage } from '../core/Stage';

/** What a transition draws with: the stage (tweens, size) and a layer above everything, scenes' HUDs included. */
export interface TransitionContext {
  readonly stage: Stage;
  readonly app: Application;
  /** Sits over the stage's world and screen layers for the length of the transition, then is destroyed. */
  readonly layer: Container;
}

/**
 * A way from one scene to the next, in two halves around the swap: `cover` hides the old scene (resolves when the
 * screen is fully covered, or the old frame is captured), the scenes change underneath — an async `onEnter` may load
 * for as long as it needs — and `reveal` shows the new one. `dispose` runs afterwards whatever happened.
 *
 * Both halves are driven by the stage's tweens, so they follow its `timeScale` and stop while the engine is paused.
 */
export interface Transition {
  cover(ctx: TransitionContext): Promise<void>;
  reveal(ctx: TransitionContext): Promise<void>;
  dispose(): void;
}
