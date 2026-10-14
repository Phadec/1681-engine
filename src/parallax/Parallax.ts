import { Container } from 'pixi.js';
import { ParallaxLayer, type ParallaxCamera, type ParallaxLayerOptions } from './ParallaxLayer';

export interface ParallaxOptions {
  /**
   * Where the whole parallax sorts among the world layer's children (its `zIndex`, default -1000): below the level,
   * so every layer stays behind it. A foreground layer (factor above 1) belongs in a second `Parallax` with a depth
   * above the level's.
   */
  depth?: number;
}

/**
 * Layers of scenery behind (or before) the world, each scrolling at its own share of the camera's speed. Add `view`
 * to the world layer — a scene's `root` — and call `update(camera, dtMs)` once a frame after the camera moved, so
 * the layers sit where this frame's view is:
 *
 * ```ts
 * const sky = new Parallax();
 * sky.add({ texture: clouds, factorX: 0.1, repeatX: true, speedX: -6 });
 * sky.add({ display: hills, factorX: 0.5, factorY: 1 });
 * this.root.addChild(sky.view);
 * // each frame
 * sky.update(stage.cameras.main, dt * 1000);
 * ```
 */
export class Parallax {
  readonly view = new Container({ sortableChildren: true });
  private readonly list: ParallaxLayer[] = [];

  constructor(options: ParallaxOptions = {}) {
    this.view.zIndex = options.depth ?? -1000;
  }

  get layers(): readonly ParallaxLayer[] {
    return this.list;
  }

  /** Adds a layer (built here from options, or one made before); later layers draw in front unless a `depth` says. */
  add(layer: ParallaxLayer | ParallaxLayerOptions): ParallaxLayer {
    const made = layer instanceof ParallaxLayer ? layer : new ParallaxLayer(layer);
    if (made.depth === undefined) made.view.zIndex = this.list.length;
    this.list.push(made);
    this.view.addChild(made.view);
    return made;
  }

  /** Takes a layer out and destroys it. */
  remove(layer: ParallaxLayer): void {
    const i = this.list.indexOf(layer);
    if (i < 0) return;
    this.list.splice(i, 1);
    layer.destroy();
  }

  update(camera: ParallaxCamera, dtMs: number): void {
    for (let i = 0; i < this.list.length; i++) this.list[i]!.update(camera, dtMs);
  }

  destroy(): void {
    this.list.length = 0;
    this.view.destroy({ children: true });
  }
}
