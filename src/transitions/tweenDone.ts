import type { Stage } from '../core/Stage';
import type { TweenConfig } from '../core/Tweener';

/** Runs a tween on the stage and resolves when it completes: the awaitable form transitions are built from. */
export function tweenDone(stage: Stage, config: TweenConfig): Promise<void> {
  return new Promise((resolve) => {
    const done = config.onComplete;
    stage.tweens.add({
      ...config,
      onComplete: () => {
        done?.();
        resolve();
      },
    });
  });
}
