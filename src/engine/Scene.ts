import { Container } from 'pixi.js';
import { World } from '../ecs/World';
import type { Engine } from './Engine';

/**
 * One screen of the game: a title, a level, a pause menu. A scene owns a `World` of entities and systems and a
 * `root` container in the engine's world layer; both are cleared when it leaves, so nothing it made outlives it.
 *
 * Override the hooks you need. `fixedUpdate` runs once per simulation step, `update` once per rendered frame, both
 * after the world's own systems of that phase.
 */
export abstract class Scene {
  readonly world = new World();
  /** Everything the scene draws in the world goes under this (the camera moves it). */
  readonly root = new Container({ sortableChildren: true });
  /** Everything the scene draws on the screen (HUD) goes under this. */
  readonly hud = new Container();
  private bound: Engine | null = null;

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

  /** @internal Engine-side wiring; games call `engine.scenes`. */
  attach(engine: Engine): void {
    this.bound = engine;
    engine.stage.world.addChild(this.root);
    engine.stage.screen.addChild(this.hud);
  }

  /** @internal Clears what the scene made but keeps its containers, so the same scene may be entered again. */
  detach(): void {
    this.world.clear();
    for (const c of [this.root, this.hud]) {
      for (const child of c.removeChildren()) child.destroy({ children: true });
      c.removeFromParent();
    }
    this.bound = null;
  }
}
