import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { fitToViewport } from './layout/fitToViewport';
import type { Size } from './layout/geometry';
import { Panel, type PanelSkin } from './Panel';
import type { UiModal, UiRoot } from './UiRoot';
import { sizeOf, Widget } from './Widget';

export interface DialogOptions {
  width: number;
  /**
   * The window's height. Left out, it is the content's height plus the padding above and below, measured again
   * whenever the dialog is laid out (`UiRoot.layout()` after the content changed size).
   */
  height?: number;
  frame: PanelSkin;
  /** The body: a `Stack` of text and buttons, anything. Laid `padding` in from the frame. */
  content: Container;
  padding?: number;
  /** The screen behind it is dimmed by this (default black at 0.5); every press on it is eaten. */
  dimColor?: number;
  dimAlpha?: number;
  /** Cancel (Esc, the pad's B) or a press outside closes it (default true). */
  dismissable?: boolean;
  /** Kept clear of the screen's edges (default 8). */
  margin?: number;
  onClose?: () => void;
}

/**
 * A modal window: the world behind it dimmed and deaf to presses, keyboard and gamepad focus trapped inside it,
 * centred and kept inside the screen however small it gets (shrunk, never past its whole scale under pixel art).
 */
export class Dialog extends Widget implements UiModal {
  onClose: (() => void) | null;
  private readonly dim = new Sprite(Texture.WHITE);
  private readonly window = new Container();
  private readonly frame: Panel;
  private root: UiRoot | null = null;

  constructor(private readonly options: DialogOptions) {
    super();
    this.onClose = options.onClose ?? null;
    this.dim.tint = options.dimColor ?? 0x000000;
    this.dim.alpha = options.dimAlpha ?? 0.5;
    this.dim.eventMode = 'static';
    this.dim.on('pointertap', () => {
      if (options.dismissable ?? true) this.close();
    });
    const height = this.windowHeight();
    this.frame = new Panel(options.frame, options.width, height);
    this.window.addChild(this.frame, options.content);
    this.addChild(this.dim, this.window);
    // the dim is the dialog's own: every press on it is the UI's
    this.makeInteractive();
    this.boxW = options.width;
    this.boxH = height;
  }

  /** The window's height: the one given, or the content's with its padding. */
  private windowHeight(): number {
    if (this.options.height !== undefined) return this.options.height;
    return sizeOf(this.options.content).height + 2 * (this.options.padding ?? 8);
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(root: UiRoot): this {
    if (this.root) return this;
    this.root = root;
    root.openModal(this);
    return this;
  }

  close(): void {
    const root = this.root;
    if (!root) return;
    this.root = null;
    root.closeModal(this);
    this.onClose?.();
  }

  cancel(): boolean {
    if (!(this.options.dismissable ?? true)) return false;
    this.close();
    return true;
  }

  layoutFor(viewport: Size): void {
    this.dim.setSize(viewport.width, viewport.height);
    this.hitArea = new Rectangle(0, 0, viewport.width, viewport.height);
    const pixel = this.host?.pixelPerfect ?? false;
    const height = this.windowHeight();
    this.boxH = height;
    const fit = fitToViewport({ width: this.options.width, height }, viewport, {
      margin: this.options.margin ?? 8,
      centre: true,
      minScale: pixel ? 1 : 0.5,
      snap: pixel,
    });
    this.window.position.set(fit.x, fit.y);
    this.window.scale.set(fit.scale);
    this.frame.resize(fit.width, fit.height);
    const pad = this.options.padding ?? 8;
    const s = sizeOf(this.options.content);
    const x = (fit.width - s.width) / 2;
    this.options.content.position.set(pixel ? Math.round(Math.max(pad, x)) : Math.max(pad, x), pad);
  }

  protected redraw(): void {}
}
