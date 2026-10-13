import type { Graphics } from '../core/Graphics';
import type { Stage } from '../core/Stage';
import { inView } from '../fx/viewCull';
import { addPixelLayer, type PixelLayer } from './PixelLayer';
import type { Point } from './pixelPaint';
import { beginBatch, endBatch, setCoverage } from './pixelTone';

export interface PaintLayerOptions {
  /** Where the layer stands (world px), read every frame: a caster, a projectile, a fixed point. */
  at: () => Point;
  /** How long it plays (ms); its last `fadeMs` dither away instead of popping out. */
  duration: number;
  /** Paints one frame `ms` into the effect, in pixels relative to the anchor. */
  paint: (g: Graphics, ms: number) => void;
  /**
   * Its draw order from the anchor's y (`y => y + 45` puts it in front of a body standing there, a negative offset
   * behind it), or a fixed number (an effect lying on the ground under every body). Default `y + 45`.
   */
  depth?: number | ((y: number) => number);
  /** Returning false removes the layer early (its caster gone, its trap sprung). */
  alive?: () => boolean;
  /** Frames a second it is redrawn at (default 12: hand-animated, like the sprites). */
  fps?: number;
  /** Paint only every that many frames (an effect thinned out for performance). Default 1. */
  every?: number;
  /** The longest fade at the end (ms); it is never more than 30% of the effect. Default 260. */
  fadeMs?: number;
  /** Told of the layer as it is made (a game that clears its transient effects on a map change keeps it). */
  onCreate?: (g: PixelLayer) => void;
}

/** How far outside the screen a layer's anchor may stand and still be painted, beyond what it has reached so far. */
const CULL_MARGIN = 64;
/**
 * The reach a layer is culled by is never less than this: an effect that grows (a ring, a blast) paints a small first
 * frame, and culled by that one it would never paint again as it swept onto the screen.
 */
const CULL_REACH_FLOOR = 192;

/**
 * One effect as its own `PixelLayer`, redrawn at `fps` and shown as a single texture: it follows its anchor to the
 * screen pixel while the art inside stays on the world grid, thins out pixel by pixel over its last frames (ordered
 * dither, `setCoverage`), is neither painted nor uploaded while its anchor is off the screen by more than it has
 * reached, and is destroyed when it ends, when `alive` says so, or with the stage's tweens.
 */
export function paintLayer(stage: Stage, o: PaintLayerOptions): PixelLayer {
  const { at, duration, paint, alive } = o;
  const depth = o.depth ?? ((y: number) => y + 45);
  const frameMs = 1000 / (o.fps ?? 12);
  const every = o.every ?? 1;
  const fadeMs = Math.min(o.fadeMs ?? 260, duration * 0.3);
  const g = addPixelLayer(stage);
  o.onCreate?.(g);
  const clock = { elapsed: 0 };
  let previous = -1;
  let reached = CULL_REACH_FLOOR;
  const cam = stage.cameras.main;
  const update = () => {
    if (alive && !alive()) {
      g.destroy();
      return;
    }
    const p = at();
    g.setPosition(cam.snap(p.x), cam.snap(p.y)).setDepth(typeof depth === 'number' ? depth : depth(p.y));
    let frame = Math.floor(clock.elapsed / frameMs);
    if (every > 1) frame -= frame % every;
    if (frame === previous) return;
    if (previous >= 0 && !inView(cam, p.x, p.y, CULL_MARGIN + Math.max(reached, g.reach()))) return;
    previous = frame;
    g.clear();
    const ms = Math.min(duration, frame * frameMs);
    setCoverage(fadeMs > 0 && ms > duration - fadeMs ? Math.max(0, (duration - ms) / fadeMs) * 0.85 + 0.15 : 1);
    beginBatch(g);
    try {
      paint(g, ms);
    } finally {
      endBatch();
      setCoverage(1);
    }
    g.present();
    reached = Math.max(reached, g.reach());
  };
  update();
  if (!g.active) return g;
  const tween = stage.tweens.add({ targets: clock, elapsed: duration, duration, onUpdate: update, onComplete: () => g.destroy() });
  g.once('destroyed', () => tween.remove());
  return g;
}
