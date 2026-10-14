import { RenderTexture, Sprite } from 'pixi.js';
import type { Transition, TransitionContext } from './Transition';
import { tweenDone } from './tweenDone';

export interface CrossfadeOptions {
  /** Ms the old scene takes to fade out over the new one (default 400). */
  duration?: number;
}

/**
 * The old scene's last frame laid over the new scene and faded out. Two live scenes cannot both be drawn (the old
 * one is gone once the new one enters), so the old frame is captured into one screen-sized render texture, freed
 * when the transition ends. The new scene's `onEnter` runs under the still frame, so a long load reads as a pause.
 */
export class CrossfadeTransition implements Transition {
  private still: Sprite | null = null;
  private texture: RenderTexture | null = null;

  constructor(private readonly options: CrossfadeOptions = {}) {}

  async cover(ctx: TransitionContext): Promise<void> {
    const { app } = ctx;
    const texture = RenderTexture.create({ width: app.screen.width, height: app.screen.height, resolution: app.renderer.resolution });
    app.renderer.render({ container: app.stage, target: texture });
    this.texture = texture;
    this.still = new Sprite(texture);
    ctx.layer.addChild(this.still);
  }

  async reveal(ctx: TransitionContext): Promise<void> {
    if (!this.still) return;
    await tweenDone(ctx.stage, { targets: this.still, alpha: 0, duration: this.options.duration ?? 400, ease: 'Sine.InOut' });
  }

  dispose(): void {
    this.still?.destroy();
    this.still = null;
    this.texture?.destroy(true);
    this.texture = null;
  }
}
