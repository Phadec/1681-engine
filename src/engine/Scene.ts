import { Container } from 'pixi.js';
import { World } from '../ecs/World';
import type { Engine } from './Engine';

/** Input a scene can be told to forget its pending presses on (an `Actions`). */
export interface FlushableInput {
  flush(): void;
}

/** A timer `Scene.delay` started; `remove` cancels it. */
export interface SceneTimer {
  remove(): void;
}

/**
 * One screen of the game: a title, a level, a pause menu. A scene owns a `World` of entities and systems and a
 * `root` container in the engine's world layer; both are cleared when it leaves, so nothing it made outlives it.
 *
 * Override the hooks you need. `fixedUpdate` runs once per simulation step, `update` once per rendered frame, both
 * after the world's own systems of that phase.
 *
 * Two things a scene should hand the engine so they end with it: timers (`delay`, not `stage.time.delayedCall`, whose
 * timers belong to the stage and fire after the scene has gone) and its input (`useInput`, flushed when a scene pushed
 * over this one pops, so presses made in a pause menu are not read again by the level under it).
 *
 * Names taken: `world`, `root` and `hud` are the scene's own fields, so a subclass cannot declare a field of those
 * names for something else (a HUD class of the game's is best kept as `display`, `overlay`, …).
 */
export abstract class Scene {
  readonly world = new World();
  /** Everything the scene draws in the world goes under this (the camera moves it). */
  readonly root = new Container({ sortableChildren: true });
  /** Everything the scene draws on the screen (HUD) goes under this. */
  readonly hud = new Container();
  private bound: Engine | null = null;
  private readonly timers = new Set<SceneTimer>();
  private readonly inputs: FlushableInput[] = [];

  /** The engine running this scene; only valid between `enter` and `exit`. */
  get engine(): Engine {
    if (!this.bound) throw new Error(`${this.constructor.name}: not running in an engine`);
    return this.bound;
  }

  /** Called once when the scene becomes active. May be async: the scene starts updating when it resolves. */
  onEnter(): void | Promise<void> {}
  /** Called when the scene is removed. The world and containers are cleared after it returns. */
  onExit(): void {}
  /** Called when another scene is pushed over this one. */
  onPause(): void {}
  /** Called when the scene over this one is popped. */
  onResume(): void {}
  /** Once per simulation step, `dt` in seconds. */
  fixedUpdate(_dt: number): void {}
  /** Once per rendered frame, `dt` in seconds; `alpha` is the share of a step since the last one (0–1). */
  update(_dt: number, _alpha: number): void {}

  /**
   * Calls `fn` after `ms` on the stage's clock, unless the scene has left by then: its timers are cancelled when it
   * exits. Only valid while the scene is running (between `enter` and `exit`).
   */
  delay(ms: number, fn: () => void): SceneTimer {
    const handle = this.engine.stage.time.delayedCall(ms, () => {
      this.timers.delete(timer);
      fn();
    });
    const timer: SceneTimer = {
      remove: () => {
        this.timers.delete(timer);
        handle.remove();
      },
    };
    this.timers.add(timer);
    return timer;
  }

  /**
   * Registers input the scene reads (an `Actions`) and returns it, so a field can be written in one line:
   * `private readonly input = this.useInput(new Actions(keyboard, bindings));`. When a scene pushed over this one
   * pops, every registered input is flushed before `onResume`, so a key pressed in the menu is not a press here.
   */
  useInput<T extends FlushableInput>(input: T): T {
    this.inputs.push(input);
    return input;
  }

  /** @internal Called by the scene manager before `onResume`. */
  flushInput(): void {
    for (const i of this.inputs) i.flush();
  }

  /** @internal Engine-side wiring; games call `engine.scenes`. */
  attach(engine: Engine): void {
    this.bound = engine;
    engine.stage.world.addChild(this.root);
    engine.stage.screen.addChild(this.hud);
  }

  /** @internal Clears what the scene made but keeps its containers, so the same scene may be entered again. */
  detach(): void {
    for (const t of [...this.timers]) t.remove();
    this.world.clear();
    for (const c of [this.root, this.hud]) {
      for (const child of c.removeChildren()) child.destroy({ children: true });
      c.removeFromParent();
    }
    this.bound = null;
  }
}
