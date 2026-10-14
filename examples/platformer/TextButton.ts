import { Button, Label } from '../../src/ui';
import { BUTTON, FONT } from './uiSkin';

/** A button whose face is one line of text that may change (a language switch, a key name). */
export class TextButton extends Button {
  private readonly caption: Label;

  constructor(text: string, width: number, onClick: () => void) {
    const label = Label.text(text, FONT);
    super({ width, height: 30, skin: BUTTON, content: label, onClick });
    this.caption = label;
  }

  /** The button centres the new text by itself: a `Label` tells its button when its size changes. */
  setText(text: string): this {
    this.caption.setText(text);
    return this;
  }
}
