import { Container, Sprite, Texture } from 'pixi.js';
import type { Stage } from '../core/Stage';
import { tweenDone } from './tweenDone';

export interface LetterboxOptions {
  /** Each bar's height as a share of the screen's (default 0.12). */
  share?: number;
  /** `0xrrggbb` (default black). */
  color?: number;
}

/**
 * Cinema bars for a cut scene: two bars slide in from the top and bottom of the screen and back out. They live on
 * the stage's screen layer, above what was there when they were made; a HUD added later draws over them, so hide it
 * for the scene. Bar heights are whole screen pixels at every step of the slide.
 */
export class Letterbox {
  readonly view = new Container();
  private readonly top = new Sprite(Texture.WHITE);
  private readonly bottom = new Sprite(Texture.WHITE);
  /** 0 hidden, 1 fully in. */
  private readonly state = { k: 0 };
  private readonly stopResize: () => void;

  constructor(
    private readonly stage: Stage,
    private readonly options: LetterboxOptions = {},
  ) {
    for (const bar of [this.top, this.bottom]) bar.tint = options.color ?? 0x000000;
    this.view.addChild(this.top, this.bottom);
    this.view.visible = false;
    stage.screen.addChild(this.view);
    this.stopResize = stage.onResize(() => this.layout());
    this.layout();
  }

  /** Whether the bars are (partly) in. */
  get shown(): boolean {
    return this.state.k > 0;
  }

  /** Slides the bars in over `ms` (0: at once). */
  show(ms = 400): Promise<void> {
    return this.to(1, ms);
  }

  hide(ms = 400): Promise<void> {
    return this.to(0, ms);
  }

  destroy(): void {
    this.stage.tweens.killTweensOf(this.state);
    this.stopResize();
    this.view.destroy({ children: true });
  }

  private to(k: number, ms: number): Promise<void> {
    this.stage.tweens.killTweensOf(this.state);
    if (ms <= 0) {
      this.state.k = k;
      this.layout();
      return Promise.resolve();
    }
    return tweenDone(this.stage, { targets: this.state, k, duration: ms, ease: 'Sine.InOut', onUpdate: () => this.layout() });
  }

  private layout(): void {
    const w = this.stage.width;
    const h = this.stage.height;
    const bar = Math.round(h * (this.options.share ?? 0.12) * this.state.k);
    this.view.visible = bar > 0;
    this.top.width = w;
    this.top.height = bar;
    this.bottom.width = w;
    this.bottom.height = bar;
    this.bottom.y = h - bar;
  }
}
