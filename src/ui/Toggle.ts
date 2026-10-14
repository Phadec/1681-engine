import { Rectangle, Sprite, Texture } from 'pixi.js';
import { Panel, type PanelSkin } from './Panel';
import { Widget } from './Widget';

export interface ToggleOptions {
  /** The box's side (px). */
  size: number;
  /** The box. */
  box: PanelSkin;
  /** The mark drawn inside when on: a texture (a pixel check), or a filled square of this colour. */
  mark: Texture | number;
  /** Drawn over the box while focused. */
  focus?: PanelSkin;
  value?: boolean;
  onChange?: (value: boolean) => void;
}

/** A checkbox: a press, Accept, or left/right on a gamepad flips it. */
export class Toggle extends Widget {
  onChange: ((value: boolean) => void) | null;
  private checked: boolean;
  private readonly box: Panel;
  private readonly mark: Sprite;
  private readonly focusFace: Panel | null;

  constructor(private readonly options: ToggleOptions) {
    super();
    this.focusable = true;
    this.checked = options.value ?? false;
    this.onChange = options.onChange ?? null;
    this.box = new Panel(options.box, options.size, options.size, { blocksPointer: false });
    this.mark = typeof options.mark === 'number' ? new Sprite(Texture.WHITE) : new Sprite(options.mark);
    if (typeof options.mark === 'number') this.mark.tint = options.mark;
    this.focusFace = options.focus ? new Panel(options.focus, options.size, options.size, { blocksPointer: false }) : null;
    this.addChild(this.box, this.mark);
    if (this.focusFace) this.addChild(this.focusFace);
    this.makeInteractive();
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, options.size, options.size);
    this.on('pointertap', () => this.set(!this.checked));
    this.resize(options.size, options.size);
  }

  get value(): boolean {
    return this.checked;
  }

  /** Sets it; `silent` skips `onChange` (mirroring a stored setting into the widget). */
  set(value: boolean, silent = false): this {
    if (value === this.checked || (!silent && !this.enabled)) return this;
    this.checked = value;
    this.redraw();
    if (!silent) this.onChange?.(value);
    return this;
  }

  override activate(): void {
    this.set(!this.checked);
  }

  protected redraw(): void {
    const w = this.boxW;
    this.box.resize(w, this.boxH);
    this.focusFace?.resize(w, this.boxH);
    if (this.focusFace) this.focusFace.visible = this.focused && this.enabled;
    this.mark.visible = this.checked;
    if (typeof this.options.mark === 'number') {
      // a filled square a quarter in from each side
      const inset = Math.round(w / 4);
      this.mark.setSize(w - 2 * inset, this.boxH - 2 * inset);
      this.mark.position.set(inset, inset);
    } else {
      this.mark.position.set(Math.round((w - this.mark.texture.width) / 2), Math.round((this.boxH - this.mark.texture.height) / 2));
    }
    this.alpha = this.enabled ? 1 : 0.5;
  }
}
