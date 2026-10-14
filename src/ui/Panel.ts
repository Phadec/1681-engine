import { Graphics, NineSliceSprite, Rectangle, type Texture } from 'pixi.js';
import type { Insets } from './layout/geometry';
import { Widget } from './Widget';

/** A 9-slice texture: the corners stay as drawn, the edges stretch one way, the middle both. */
export interface TextureSkin {
  texture: Texture;
  /** Corner sizes in texture pixels. */
  insets: Insets;
}

/** A plain box: fill, and an optional border drawn inside the edge. */
export interface ColourSkin {
  color: number;
  /** Opacity of fill and border alike (default 1); `fillAlpha` and `borderAlpha` override it for one of them. */
  alpha?: number;
  /** Opacity of the fill alone: 0 draws a bare ring (a focus mark over a face that should still show). */
  fillAlpha?: number;
  /** Opacity of the border alone. */
  borderAlpha?: number;
  border?: number;
  borderColor?: number;
}

export type PanelSkin = TextureSkin | ColourSkin;

export interface PanelOptions {
  /** Presses on it are the UI's and never reach the world under it (default true). */
  blocksPointer?: boolean;
}

/**
 * A framed box: a 9-slice of any texture (a window frame, a button face), or a colour box when a game has no art
 * yet. The background of windows, buttons, bars and dialogs.
 */
export class Panel extends Widget {
  private readonly slice: NineSliceSprite | null = null;
  private readonly box: Graphics | null = null;

  constructor(
    readonly skin: PanelSkin,
    width: number,
    height: number,
    options: PanelOptions = {},
  ) {
    super();
    if ('texture' in skin) {
      const { left, top, right, bottom } = skin.insets;
      this.slice = new NineSliceSprite({ texture: skin.texture, leftWidth: left, topHeight: top, rightWidth: right, bottomHeight: bottom });
      this.addChild(this.slice);
    } else {
      this.box = new Graphics();
      this.addChild(this.box);
    }
    if (options.blocksPointer ?? true) {
      this.makeInteractive();
      this.hitArea = new Rectangle(0, 0, 0, 0);
    }
    this.resize(width, height);
  }

  protected redraw(): void {
    const w = this.boxW;
    const h = this.boxH;
    if (this.hitArea instanceof Rectangle) {
      this.hitArea.width = w;
      this.hitArea.height = h;
    }
    if (this.slice) {
      // pixel art: the frame's corners land on whole pixels
      this.slice.roundPixels = this.host?.pixelPerfect ?? false;
      this.slice.width = w;
      this.slice.height = h;
      return;
    }
    const skin = this.skin as ColourSkin;
    const g = this.box!;
    g.clear();
    const b = skin.border ?? 0;
    const fillAlpha = skin.fillAlpha ?? skin.alpha ?? 1;
    const borderAlpha = skin.borderAlpha ?? skin.alpha ?? 1;
    if (w <= 0 || h <= 0) return;
    if (b > 0) {
      // the border as four strips round the fill, never a box under it: a see-through fill would show it through
      const bc = { color: skin.borderColor ?? 0xffffff, alpha: borderAlpha };
      if (w <= 2 * b || h <= 2 * b) {
        g.rect(0, 0, w, h).fill(bc);
        return;
      }
      g.rect(0, 0, w, b).fill(bc);
      g.rect(0, h - b, w, b).fill(bc);
      g.rect(0, b, b, h - 2 * b).fill(bc);
      g.rect(w - b, b, b, h - 2 * b).fill(bc);
      if (fillAlpha > 0) g.rect(b, b, w - 2 * b, h - 2 * b).fill({ color: skin.color, alpha: fillAlpha });
    } else if (fillAlpha > 0) {
      g.rect(0, 0, w, h).fill({ color: skin.color, alpha: fillAlpha });
    }
  }
}
