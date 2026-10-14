import { type BitmapLabel, installLabelFont } from '../core/BitmapLabel';
import type { Stage } from '../core/Stage';

/** One look of floating text: a size and a fill colour. Each look is its own baked font. */
export interface FloatingTextStyle {
  size: number;
  color: string;
}

export interface FloatingTextOptions {
  /** A font already loaded (`document.fonts.load`), or the glyphs bake in the fallback. */
  fontFamily: string;
  /** Outline colour (default near-black). */
  stroke?: string;
  /** Outline width for a size (default a fifth of it, at least 2). */
  strokeWidth?: (size: number) => number;
  /** Rasterising resolution (default 4, crisp under a zoomed camera). */
  resolution?: number;
  /** Spent labels of one style kept for reuse; the rest are destroyed (default 24). */
  keepPerStyle?: number;
  /** Depth given to every label taken (default: left as made). */
  depth?: number;
}

/** How `float` moves a label: pops from `pop`× to 1, holds, then rises `rise` px while fading out. */
export interface FloatOptions {
  rise?: number;
  /** Sideways drift over the fade, px (pass a random one for a crowd of numbers that do not stack). */
  driftX?: number;
  pop?: number;
  popMs?: number;
  holdMs?: number;
  fadeMs?: number;
}

const keyOf = (s: FloatingTextStyle) => `${s.size}|${s.color}`;

/**
 * Floating text — damage numbers, pickups, "+1" — drawn from bitmap fonts and reused rather than created and
 * destroyed each time: a crowded fight throws dozens a second, and as canvas text each one repainted a canvas at
 * resolution 4 and uploaded it. A label keeps its font, so spent ones are pooled per style and only their string
 * changes. Fonts are baked ahead (`warm`): a style first met mid-fight baked its glyph pages on that frame.
 */
export class FloatingText {
  private readonly pools = new Map<string, BitmapLabel[]>();
  private readonly stroke: string;
  private readonly strokeWidth: (size: number) => number;
  private readonly resolution: number;
  private readonly keep: number;

  constructor(
    private readonly stage: Stage,
    private readonly options: FloatingTextOptions,
  ) {
    this.stroke = options.stroke ?? '#140e18';
    this.strokeWidth = options.strokeWidth ?? ((size) => Math.max(2, Math.round(size / 5)));
    this.resolution = options.resolution ?? 4;
    this.keep = options.keepPerStyle ?? 24;
  }

  /**
   * Bakes the fonts of `styles`, one a task starting `delayMs` from now, so no frame pays for them all at once — ten
   * at once froze a world's first frame half a second (each font measures and kerns every glyph). Returns a cancel.
   */
  warm(styles: readonly FloatingTextStyle[], delayMs = 1000, gapMs = 50): () => void {
    const todo = [...styles];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = () => {
      const s = todo.shift();
      if (!s) return;
      this.install(s);
      timer = setTimeout(next, gapMs);
    };
    timer = setTimeout(next, delayMs);
    return () => clearTimeout(timer);
  }

  /** Bakes one style's font now. */
  install(style: FloatingTextStyle): void {
    installLabelFont(this.options.fontFamily, style.size, style.color, this.stroke, this.strokeWidth(style.size), this.resolution);
  }

  /** A label ready to animate: shown, opaque, unscaled, anchored at its bottom centre on (x, y). */
  take(x: number, y: number, text: string, style: FloatingTextStyle): BitmapLabel {
    const pool = this.pools.get(keyOf(style));
    let t = pool?.pop();
    while (t && t.destroyed) t = pool?.pop();
    if (!t) {
      t = this.stage.add
        .label(x, y, text, this.options.fontFamily, style.size, style.color, this.stroke, this.strokeWidth(style.size), this.resolution)
        .setOrigin(0.5, 1);
    } else {
      t.setText(text);
      t.position.set(x, y);
      t.alpha = 1;
      t.setScale(1);
      t.visible = true;
    }
    if (this.options.depth !== undefined) t.setDepth(this.options.depth);
    return t;
  }

  /** Hands a finished label back for reuse. */
  release(t: BitmapLabel, style: FloatingTextStyle): void {
    if (t.destroyed) return;
    const key = keyOf(style);
    let pool = this.pools.get(key);
    if (!pool) this.pools.set(key, (pool = []));
    if (pool.length >= this.keep) {
      t.destroy();
      return;
    }
    t.visible = false;
    pool.push(t);
  }

  /** A label that pops, rises, fades and goes back to the pool by itself, on the stage's own tweens. */
  float(x: number, y: number, text: string, style: FloatingTextStyle, options: FloatOptions = {}): BitmapLabel {
    const { rise = 16, driftX = 0, pop = 1.4, popMs = 120, holdMs = 350, fadeMs = 500 } = options;
    const t = this.take(x, y, text, style);
    const tweens = this.stage.tweens;
    if (pop !== 1) {
      t.setScale(pop);
      tweens.add({ targets: t, scale: 1, duration: popMs, ease: 'Back.Out' });
    }
    tweens.add({
      targets: t,
      x: x + driftX,
      y: y - rise,
      alpha: 0,
      delay: holdMs,
      duration: fadeMs,
      ease: 'Sine.In',
      onComplete: () => this.release(t, style),
    });
    return t;
  }

  /** Destroys every pooled label (a scene ending); labels still out are the scene's to free. */
  clear(): void {
    for (const pool of this.pools.values()) for (const t of pool) if (!t.destroyed) t.destroy();
    this.pools.clear();
  }
}
