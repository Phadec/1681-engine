import type { Engine } from './Engine';
import type { Scene } from './Scene';

/**
 * A stack of scenes. Only the top one updates; the ones under it are paused but still drawn (a pause menu over the
 * level). Changes are queued and applied one at a time, so a scene that replaces itself from inside its own update,
 * or an async `onEnter` still loading, never leaves two scenes half entered.
 */
export class SceneManager {
  private readonly stack: Scene[] = [];
  private queue: Promise<void> = Promise.resolve();
  /** True while an async `onEnter` is running: nothing updates until it is done. */
  private entering = false;

  constructor(private readonly engine: Engine) {}

  /** The scene that updates, if any. */
  get current(): Scene | undefined {
    return this.entering ? undefined : this.stack[this.stack.length - 1];
  }

  /** Every scene on the stack, bottom first. */
  get all(): readonly Scene[] {
    return this.stack;
  }

  /** Removes every scene and enters `scene`. */
  replace(scene: Scene): Promise<void> {
    return this.enqueue(async () => {
      while (this.stack.length) this.exitTop();
      await this.enter(scene);
    });
  }

  /** Pauses the current scene and enters `scene` over it. */
  push(scene: Scene): Promise<void> {
    return this.enqueue(async () => {
      this.stack[this.stack.length - 1]?.onPause();
      await this.enter(scene);
    });
  }

  /** Leaves the current scene and resumes the one under it. */
  pop(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.stack.length) return;
      this.exitTop();
      this.stack[this.stack.length - 1]?.onResume();
    });
  }

  /** Leaves every scene (the engine is shutting down). */
  clear(): Promise<void> {
    return this.enqueue(async () => {
      while (this.stack.length) this.exitTop();
    });
  }

  private async enter(scene: Scene): Promise<void> {
    if (this.stack.includes(scene)) throw new Error(`${scene.constructor.name} is already on the scene stack`);
    scene.attach(this.engine);
    this.stack.push(scene);
    this.entering = true;
    try {
      await scene.onEnter();
    } finally {
      this.entering = false;
    }
    this.engine.loop.reset();
  }

  private exitTop(): void {
    const scene = this.stack.pop();
    if (!scene) return;
    try {
      scene.onExit();
    } finally {
      scene.detach();
    }
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.queue.then(job);
    // a failed change must not wedge every change after it
    this.queue = run.catch((err) => this.engine.reportError('scene', err));
    return run;
  }
}
