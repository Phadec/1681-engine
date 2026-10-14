import type { BLEND_MODES } from 'pixi.js';
import type { Group } from './Group';
import type { Stage } from './Stage';

export interface BlendLayerOptions {
  /** How its sprites blend (default `'add'`, light). Set on the container, so a sprite added needs no blend of its own. */
  blend?: BLEND_MODES;
  /**
   * Its depth among the world's children (default 999,000: over every body sorted by a y under a million px, under
   * labels a game keeps just below 1,000,000). Applied whenever given, so the first caller need not be the one to set it.
   */
  depth?: number;
  /** A stage may hold several (a light layer and a shadow one): each name is its own container (default the blend's). */
  name?: string;
}

const LAYERS = new WeakMap<Stage, Map<string, Group>>();

/**
 * One container per stage (and name) for every sprite of a blend mode: lamp glows, portals, the glow under loot.
 * Laid among the bodies by depth, each additive sprite switched the blend mode twice and split the sprite batch — in
 * one game 85–97 draw calls a frame in a fight, two thirds of them blend changes; gathered here they are one run.
 * The price is that they no longer sort with the bodies: the layer stands over all of them, so put a glow where its
 * light falls rather than relying on a body to cover it. Made again if destroyed (a scene change).
 */
export function blendLayer(stage: Stage, options: BlendLayerOptions = {}): Group {
  const blend = options.blend ?? 'add';
  const name = options.name ?? blend;
  let byName = LAYERS.get(stage);
  if (!byName) {
    byName = new Map();
    LAYERS.set(stage, byName);
  }
  let layer = byName.get(name);
  if (!layer || layer.destroyed) {
    layer = stage.add.container(0, 0).setDepth(options.depth ?? 999_000);
    layer.blendMode = blend;
    byName.set(name, layer);
  } else if (options.depth !== undefined && layer.depth !== options.depth) {
    layer.setDepth(options.depth);
  }
  return layer;
}
