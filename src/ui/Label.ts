import { BitmapLabel } from '../core/BitmapLabel';
import { Text, type TextStyle } from '../core/Text';
import { Widget } from './Widget';

/** What a label prints with: a canvas `Text` (any font, rich wrapping) or a `BitmapLabel` (cheap to change). */
export type LabelText = Text | BitmapLabel;

/**
 * A line (or block) of text with a layout box measured from what it prints. A HUD number rewritten every frame
 * should be a `BitmapLabel`: a `Text` repaints and uploads its canvas on every change.
 */
export class Label extends Widget {
  private last = '';

  constructor(readonly text: LabelText) {
    super();
    text.anchor.set(0, 0);
    text.position.set(0, 0);
    this.addChild(text);
    this.last = text.text;
    this.measure();
  }

  /** A label printed with a canvas `Text`. */
  static text(value: string, style: TextStyle): Label {
    return new Label(new Text(0, 0, value, style));
  }

  /** A label printed from a bitmap font (see `installLabelFont`). */
  static bitmap(value: string, fontFamily: string, size: number, color: string, stroke = '#000000', strokeWidth = 0, resolution = 1): Label {
    return new Label(new BitmapLabel(0, 0, value, fontFamily, size, color, stroke, strokeWidth, resolution));
  }

  get value(): string {
    return this.last;
  }

  /** Changes the text; the same string again costs nothing (a HUD may set it every frame). */
  setText(value: string): this {
    if (value === this.last) return this;
    this.last = value;
    this.text.text = value;
    this.measure();
    return this;
  }

  private measure(): void {
    // rounded up: a box that loses the last half pixel of a glyph clips it in a tight layout
    this.boxW = Math.ceil(this.text.width);
    this.boxH = Math.ceil(this.text.height);
  }

  protected redraw(): void {
    this.alpha = this.enabled ? 1 : 0.5;
  }
}
