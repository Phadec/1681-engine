import { Text as PixiText, type TextStyleOptions } from 'pixi.js';
import { GameObject } from './gameObject';

export interface TextStyle {
  fontFamily?: string;
  fontSize: string | number;
  color?: string;
  stroke?: string;
  strokeThickness?: number;
  /** Texture pixels per world pixel: world text is zoomed by the camera, so it is rasterised finer. */
  resolution?: number;
  align?: 'left' | 'center' | 'right';
  lineSpacing?: number;
  wordWrapWidth?: number;
}

/** Canvas text in world or screen space. */
export class Text extends GameObject(PixiText) {
  constructor(x: number, y: number, text: string, style: TextStyle) {
    // only keys that are set: an explicit undefined overrides Pixi's default (leading: undefined = NaN height)
    const pixiStyle: TextStyleOptions = {
      fontFamily: style.fontFamily ?? 'monospace',
      fontSize: typeof style.fontSize === 'string' ? parseFloat(style.fontSize) : style.fontSize,
      fill: style.color ?? '#ffffff',
    };
    if (style.stroke) pixiStyle.stroke = { color: style.stroke, width: style.strokeThickness ?? 1, join: 'round' };
    if (style.align) pixiStyle.align = style.align;
    if (style.lineSpacing !== undefined) pixiStyle.leading = style.lineSpacing;
    if (style.wordWrapWidth !== undefined) {
      pixiStyle.wordWrap = true;
      pixiStyle.wordWrapWidth = style.wordWrapWidth;
    }
    super({ text, resolution: style.resolution ?? 1, style: pixiStyle });
    this.position.set(x, y);
  }

  setOrigin(x = 0.5, y = x): this {
    this.anchor.set(x, y);
    return this;
  }

  setText(text: string): this {
    this.text = text;
    return this;
  }
}
