import { Container, Rectangle } from 'pixi.js';
import { Panel, type PanelSkin } from './Panel';
import { sizeOf, Widget } from './Widget';

export type ButtonState = 'normal' | 'hover' | 'pressed' | 'disabled';

export interface ButtonSkin {
  normal: PanelSkin;
  hover?: PanelSkin;
  pressed?: PanelSkin;
  disabled?: PanelSkin;
  /** Drawn over the face while it has keyboard or gamepad focus (a ring, a brighter frame). */
  focus?: PanelSkin;
  /** How far the content drops while pressed (px, default 1): a pressed face is the same face a pixel lower. */
  pressOffset?: number;
}

export interface ButtonOptions {
  width: number;
  height: number;
  skin: ButtonSkin;
  /** Centred on the face: a `Label`, an icon, anything. */
  content?: Container;
  onClick?: () => void;
}

/** Walks up for a scroll view that was just dragged: lifting a finger after scrolling a list is not a tap. */
function tapSuppressed(c: Container | null): boolean {
  for (let p = c; p; p = p.parent) if ((p as { suppressesTaps?: boolean }).suppressesTaps === true) return true;
  return false;
}

/**
 * A pressable button: normal, hover, pressed and disabled faces, a focus overlay, pointer and touch through Pixi's
 * events, and Accept from the keyboard or a gamepad through the focus manager.
 */
export class Button extends Widget {
  onClick: (() => void) | null;
  private readonly faces = new Map<PanelSkin, Panel>();
  private readonly focusFace: Panel | null;
  private readonly content: Container | null;
  private hovered = false;
  private pressing = false;

  constructor(private readonly options: ButtonOptions) {
    super();
    this.focusable = true;
    this.onClick = options.onClick ?? null;
    const skin = options.skin;
    // one panel per distinct skin, shown in turn: no redraw when the state changes
    for (const s of [skin.normal, skin.hover, skin.pressed, skin.disabled]) {
      if (s && !this.faces.has(s)) {
        const face = new Panel(s, options.width, options.height, { blocksPointer: false });
        this.faces.set(s, face);
        this.addChild(face);
      }
    }
    this.focusFace = skin.focus ? new Panel(skin.focus, options.width, options.height, { blocksPointer: false }) : null;
    if (this.focusFace) this.addChild(this.focusFace);
    this.content = options.content ?? null;
    if (this.content) this.addChild(this.content);
    this.makeInteractive();
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, 0, 0);
    this.on('pointerover', () => this.setPointer(true, this.pressing));
    this.on('pointerout', () => this.setPointer(false, this.pressing));
    this.on('pointerdown', () => this.setPointer(this.hovered, true));
    this.on('pointerup', () => this.setPointer(this.hovered, false));
    this.on('pointerupoutside', () => this.setPointer(false, false));
    this.on('pointercancel', () => this.setPointer(false, false));
    // a tap: down and up on the button, by mouse, pen or finger
    this.on('pointertap', () => {
      if (!tapSuppressed(this)) this.click();
    });
    this.resize(options.width, options.height);
  }

  get state(): ButtonState {
    if (!this.enabled) return 'disabled';
    if (this.pressing) return 'pressed';
    return this.hovered ? 'hover' : 'normal';
  }

  /** Runs the button's action, if it is enabled. */
  click(): void {
    if (this.enabled) this.onClick?.();
  }

  override activate(): void {
    this.click();
  }

  private setPointer(hovered: boolean, pressing: boolean): void {
    if (hovered === this.hovered && pressing === this.pressing) return;
    this.hovered = hovered;
    this.pressing = pressing;
    this.redraw();
  }

  protected redraw(): void {
    const skin = this.options.skin;
    const state = this.state;
    const wanted = (state === 'disabled' ? skin.disabled : state === 'pressed' ? (skin.pressed ?? skin.hover) : state === 'hover' ? skin.hover : undefined) ?? skin.normal;
    for (const [s, face] of this.faces) {
      face.visible = s === wanted;
      if (face.boxWidth !== this.boxW || face.boxHeight !== this.boxH) face.resize(this.boxW, this.boxH);
    }
    if (this.focusFace) {
      this.focusFace.visible = this.focused && this.enabled;
      if (this.focusFace.boxWidth !== this.boxW || this.focusFace.boxHeight !== this.boxH) this.focusFace.resize(this.boxW, this.boxH);
    }
    if (this.hitArea instanceof Rectangle) {
      this.hitArea.width = this.boxW;
      this.hitArea.height = this.boxH;
    }
    if (this.content) {
      const s = sizeOf(this.content);
      const drop = state === 'pressed' ? (skin.pressOffset ?? 1) : 0;
      const snap = this.host?.pixelPerfect ?? false;
      const x = (this.boxW - s.width) / 2;
      const y = (this.boxH - s.height) / 2 + drop;
      this.content.position.set(snap ? Math.round(x) : x, snap ? Math.round(y) : y);
    }
    // without a disabled face, a disabled button fades
    this.alpha = state === 'disabled' && !skin.disabled ? 0.5 : 1;
  }
}
