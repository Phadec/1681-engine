import { Rectangle, type FederatedPointerEvent } from 'pixi.js';
import type { NavDirection } from './layout/focusNav';
import { quantize, sliderFraction, sliderValueAt } from './layout/slider';
import { Panel, type PanelSkin } from './Panel';
import { Widget } from './Widget';

export interface SliderOptions {
  width: number;
  height: number;
  track: PanelSkin;
  /** The filled part left of the knob (optional). */
  fill?: PanelSkin;
  knob: PanelSkin;
  /** The knob's width (default `height`). */
  knobWidth?: number;
  /** Over the whole slider while focused. */
  focus?: PanelSkin;
  min?: number;
  max?: number;
  /** Snap to steps of this size (0: any value). */
  step?: number;
  /** One left/right press moves this much (default `step`, or a tenth of the range). */
  navStep?: number;
  value?: number;
  onChange?: (value: number) => void;
}

/** A horizontal slider: dragged by pointer or finger anywhere on its track, stepped by left/right when focused. */
export class Slider extends Widget {
  onChange: ((value: number) => void) | null;
  readonly min: number;
  readonly max: number;
  private current: number;
  private readonly track: Panel;
  private readonly fill: Panel | null;
  private readonly knob: Panel;
  private readonly focusFace: Panel | null;
  private readonly onMove = (e: FederatedPointerEvent) => this.dragTo(e);
  private readonly onUp = () => this.endDrag();

  constructor(private readonly options: SliderOptions) {
    super();
    this.focusable = true;
    this.min = options.min ?? 0;
    this.max = options.max ?? 1;
    this.current = quantize(options.value ?? this.min, this.min, this.max, options.step);
    this.onChange = options.onChange ?? null;
    this.track = new Panel(options.track, options.width, options.height, { blocksPointer: false });
    this.fill = options.fill ? new Panel(options.fill, 0, options.height, { blocksPointer: false }) : null;
    this.knob = new Panel(options.knob, options.knobWidth ?? options.height, options.height, { blocksPointer: false });
    this.focusFace = options.focus ? new Panel(options.focus, options.width, options.height, { blocksPointer: false }) : null;
    this.addChild(this.track);
    if (this.fill) this.addChild(this.fill);
    this.addChild(this.knob);
    if (this.focusFace) this.addChild(this.focusFace);
    this.makeInteractive();
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, 0, 0);
    this.on('pointerdown', (e) => {
      if (!this.enabled) return;
      // global moves only while dragging: a listener left on would hear every move of the session
      this.on('globalpointermove', this.onMove);
      this.on('pointerup', this.onUp);
      this.on('pointerupoutside', this.onUp);
      this.dragTo(e);
    });
    this.resize(options.width, options.height);
  }

  get value(): number {
    return this.current;
  }

  /** Sets it; `silent` skips `onChange`. */
  setValue(value: number, silent = false): this {
    const v = quantize(value, this.min, this.max, this.options.step);
    if (v === this.current) return this;
    this.current = v;
    this.redraw();
    if (!silent) this.onChange?.(v);
    return this;
  }

  override navigate(dir: NavDirection): boolean {
    if (dir !== 'left' && dir !== 'right') return false;
    const step = this.options.navStep ?? (this.options.step || (this.max - this.min) / 10);
    this.setValue(this.current + (dir === 'right' ? step : -step));
    return true;
  }

  override destroy(): void {
    this.endDrag();
    super.destroy({ children: true });
  }

  private dragTo(e: FederatedPointerEvent): void {
    const local = this.toLocal(e.global);
    const knobW = this.knob.boxWidth;
    // the knob's centre follows the pointer, kept on the track
    this.setValue(sliderValueAt(local.x, knobW / 2, this.boxW - knobW, this.min, this.max, this.options.step));
  }

  private endDrag(): void {
    this.off('globalpointermove', this.onMove);
    this.off('pointerup', this.onUp);
    this.off('pointerupoutside', this.onUp);
  }

  protected redraw(): void {
    const w = this.boxW;
    const h = this.boxH;
    this.track.resize(w, h);
    this.focusFace?.resize(w, h);
    if (this.focusFace) this.focusFace.visible = this.focused && this.enabled;
    if (this.hitArea instanceof Rectangle) {
      this.hitArea.width = w;
      this.hitArea.height = h;
    }
    const knobW = this.knob.boxWidth;
    const x = Math.round(sliderFraction(this.current, this.min, this.max) * (w - knobW));
    this.knob.place(x, 0);
    this.fill?.resize(x + Math.round(knobW / 2), h);
    this.alpha = this.enabled ? 1 : 0.5;
  }
}
