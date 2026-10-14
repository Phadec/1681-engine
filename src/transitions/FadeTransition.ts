import { Sprite, Texture } from 'pixi.js';
import type { Transition, TransitionContext } from './Transition';
import { tweenDone } from './tweenDone';

export interface FadeOptions {
  /** `0xrrggbb` (default black). */
  color?: number;
  /** Ms for each half (default 300). */
  duration?: number;
  /** Ms to rest fully covered before revealing (default 0). */
  hold?: number;
}

/** Fades to a colour, swaps the scene, fades back. */
export class FadeTransition implements Transition {
  private sheet: Sprite | null = null;
  private stopResize: (() => void) | null = null;

  constructor(private readonly options: FadeOptions = {}) {}

  async cover(ctx: TransitionContext): Promise<void> {
    const sheet = new Sprite(Texture.WHITE);
    sheet.tint = this.options.color ?? 0x000000;
    sheet.alpha = 0;
    this.sheet = sheet;
    ctx.layer.addChild(sheet);
    const fit = () => {
      sheet.width = ctx.stage.width;
      sheet.height = ctx.stage.height;
    };
    fit();
    this.stopResize = ctx.stage.onResize(fit);
    await tweenDone(ctx.stage, { targets: sheet, alpha: 1, duration: this.options.duration ?? 300, ease: 'Sine.InOut' });
  }

  async reveal(ctx: TransitionContext): Promise<void> {
    if (!this.sheet) return;
    await tweenDone(ctx.stage, {
      targets: this.sheet,
      alpha: 0,
      delay: this.options.hold ?? 0,
      duration: this.options.duration ?? 300,
      ease: 'Sine.InOut',
    });
  }

  dispose(): void {
    this.stopResize?.();
    this.stopResize = null;
    this.sheet?.destroy();
    this.sheet = null;
  }
}
