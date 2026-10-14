import { Container, type Ticker } from 'pixi.js';
import { Stage } from '../core/Stage';
import { DEFAULT_NAV, FocusManager, type NavBindings, type NavInput } from './FocusManager';
import { anchorPosition, type ScreenAnchor } from './layout/anchor';
import type { Insets, Size } from './layout/geometry';
import type { UiHost, UiTicking } from './UiHost';
import { UiPointerGate } from './UiPointerGate';
import { sizeOf } from './Widget';

/** A window that takes the screen while it is open (a `Dialog`): laid out on resize, asked on Cancel. */
export interface UiModal extends Container {
  /** Lays itself out for the screen's size. */
  layoutFor(viewport: Size): void;
  /** Cancel pressed inside it; true when it used it (it closed). */
  cancel(): boolean;
}

export interface UiRootOptions {
  /** Lay out on whole pixels (default: the camera's `roundPixels`, which `pixelPerfect: true` turns on). */
  pixelPerfect?: boolean;
  /** The action names navigation reads (default `ui_up`, `ui_down`, … `ui_accept`, `ui_cancel`). */
  bindings?: Partial<NavBindings>;
}

interface Pin {
  child: Container;
  anchor: ScreenAnchor;
  margin: number | Partial<Insets>;
}

/**
 * The canvas UI's root, on the stage's screen layer above the world: it pins HUD pieces to screen corners and keeps
 * them there on resize, owns keyboard/gamepad focus, ticks only the widgets that are moving, opens modals with a
 * focus trap, and keeps presses on widgets from reaching the world (`UiPointerGate`).
 *
 * ```ts
 * const ui = new UiRoot(engine.stage);
 * ui.pin(healthBar, 'top-left', 8);
 * // in a fixed step, between actions.poll() and endStep():
 * if (!ui.handleInput(actions) && !ui.capturesInput) movePlayer();
 * ```
 */
export class UiRoot extends Container implements UiHost {
  readonly isUiHost = true;
  readonly pixelPerfect: boolean;
  readonly focus: FocusManager;
  private readonly pins: Pin[] = [];
  private readonly moving = new Set<UiTicking>();
  private readonly modals: UiModal[] = [];
  private readonly cleanup: (() => void)[] = [];
  private readonly ticker: Ticker;
  private readonly onTick = (t: Ticker) => this.guardedUpdate(t.deltaMS);

  constructor(
    private readonly stage: Stage,
    options: UiRootOptions = {},
  ) {
    super();
    this.pixelPerfect = options.pixelPerfect ?? stage.cameras.main.roundPixels;
    this.focus = new FocusManager(this, { ...DEFAULT_NAV, ...options.bindings });
    stage.screen.addChild(this);
    this.cleanup.push(stage.onResize(() => this.layout()), UiPointerGate.install());
    // after the engine's own frame (same priority, added later): widgets tick once the game has set their values
    this.ticker = stage.app.ticker;
    this.ticker.add(this.onTick);
  }

  /** The screen's size in screen pixels. */
  get viewport(): Size {
    return { width: this.stage.width, height: this.stage.height };
  }

  /** A modal is open or a widget has focus: the game should leave its own actions alone this step. */
  get capturesInput(): boolean {
    return this.modals.length > 0 || this.focus.focused !== null;
  }

  /** Adds `child` and keeps it pinned to a screen anchor, `margin` in from the edges, through every resize. */
  pin(child: Container, anchor: ScreenAnchor, margin: number | Partial<Insets> = 0): this {
    if (child.parent !== this) this.addChild(child);
    const i = this.pins.findIndex((p) => p.child === child);
    if (i >= 0) this.pins.splice(i, 1);
    this.pins.push({ child, anchor, margin });
    this.place(this.pins[this.pins.length - 1]!);
    this.invalidateFocus();
    return this;
  }

  unpin(child: Container): this {
    const i = this.pins.findIndex((p) => p.child === child);
    if (i >= 0) this.pins.splice(i, 1);
    return this;
  }

  /** Places every pinned piece and open modal again (after one changed size; resizes do it by themselves). */
  layout(): void {
    for (let i = this.pins.length - 1; i >= 0; i--) {
      const p = this.pins[i]!;
      if (p.child.destroyed) this.pins.splice(i, 1);
      else this.place(p);
    }
    const view = this.viewport;
    for (const m of this.modals) m.layoutFor(view);
  }

  /** Opens a modal over everything: focus is trapped inside it until it closes. */
  openModal(modal: UiModal): void {
    if (this.modals.includes(modal)) return;
    this.modals.push(modal);
    this.addChild(modal);
    modal.layoutFor(this.viewport);
    this.focus.pushScope(modal, () => modal.cancel());
  }

  closeModal(modal: UiModal): void {
    const i = this.modals.indexOf(modal);
    if (i < 0) return;
    this.modals.splice(i, 1);
    this.focus.popScope(modal);
    if (modal.parent === this) this.removeChild(modal);
  }

  /** Reads one step of navigation input (call between `actions.poll()` and `endStep()`); true when the UI used it. */
  handleInput(input: NavInput): boolean {
    return this.focus.handle(input);
  }

  invalidateFocus(): void {
    this.focus.invalidate();
  }

  animate(t: UiTicking): void {
    this.moving.add(t);
  }

  /** Ticks what is moving; called by the ticker, or by a game driving the UI itself. */
  update(dtMs: number): void {
    // deleting the entry being visited is safe in a Set walk, so a settled widget leaves without a copy
    for (const t of this.moving) if (!t.tick(dtMs)) this.moving.delete(t);
  }

  override destroy(): void {
    this.ticker.remove(this.onTick);
    for (const fn of this.cleanup.splice(0)) fn();
    this.moving.clear();
    this.pins.length = 0;
    this.modals.length = 0;
    super.destroy({ children: true });
  }

  private place(p: Pin): void {
    const pos = anchorPosition(p.anchor, sizeOf(p.child), this.viewport, p.margin, this.pixelPerfect);
    p.child.position.set(pos.x, pos.y);
  }

  /** A ticker listener that throws never asks for the next frame: the UI's faults are caught and reported once. */
  private guardedUpdate(dtMs: number): void {
    try {
      this.update(dtMs);
    } catch (err) {
      this.moving.clear();
      console.error('[ui] update failed', err);
      Stage.onCaught?.('[ui] update', err);
    }
  }
}
