import { Container, type FederatedPointerEvent } from 'pixi.js';
import type { NavDirection } from './layout/focusNav';
import { snapPx, type Size } from './layout/geometry';
import { uiHostOf, type UiHost } from './UiHost';
import { UiPointerGate } from './UiPointerGate';

/** Every press on a widget is the UI's, never the world's under it (see `UiPointerGate`). */
function consumePress(e: FederatedPointerEvent): void {
  UiPointerGate.consume(e.nativeEvent);
}

/**
 * The base of every canvas widget: a Pixi container with a layout box (`boxWidth` × `boxHeight`, its own units, not
 * its drawn bounds), an enabled and a focused state, and the hooks keyboard and gamepad navigation call.
 *
 * A widget is a Pixi `Container`, so Container's own members are taken names: in particular `label` (Pixi's debug
 * name, a string) — a subclass field `label` holding a `Label` clashes with it; call it `caption`, `title`, … .
 */
export abstract class Widget extends Container {
  /** Whether the focus manager may land on it (buttons, sliders, toggles). */
  focusable = false;
  protected boxW = 0;
  protected boxH = 0;
  private isEnabled = true;
  private isFocused = false;

  get boxWidth(): number {
    return this.boxW;
  }

  get boxHeight(): number {
    return this.boxH;
  }

  get enabled(): boolean {
    return this.isEnabled;
  }

  set enabled(v: boolean) {
    if (v === this.isEnabled) return;
    this.isEnabled = v;
    this.cursor = v && this.focusable ? 'pointer' : 'default';
    this.redraw();
    this.host?.invalidateFocus();
  }

  get focused(): boolean {
    return this.isFocused;
  }

  /** Called by the focus manager. */
  setFocused(v: boolean): void {
    if (v === this.isFocused) return;
    this.isFocused = v;
    this.redraw();
  }

  /** Resizes the layout box (whole pixels under a pixel-perfect root) and redraws. */
  resize(width: number, height: number): this {
    const snap = this.host?.pixelPerfect ?? false;
    this.boxW = Math.max(0, snapPx(width, snap));
    this.boxH = Math.max(0, snapPx(height, snap));
    this.redraw();
    return this;
  }

  /** Moves it, on whole pixels under a pixel-perfect root. */
  place(x: number, y: number): this {
    const snap = this.host?.pixelPerfect ?? false;
    this.position.set(snapPx(x, snap), snapPx(y, snap));
    return this;
  }

  /** Focusable now: enabled, shown, and every parent shown. */
  canFocus(): boolean {
    if (!this.focusable || !this.isEnabled) return false;
    for (let c: Container | null = this; c; c = c.parent) if (!c.visible) return false;
    return true;
  }

  /** Accept pressed while focused (Enter, the pad's A). */
  activate(): void {}

  /** A direction pressed while focused; true when the widget used it (a slider stepping) so focus stays. */
  navigate(_dir: NavDirection): boolean {
    return false;
  }

  /** The root it sits under, looked up when needed: a widget may be built before it is added. */
  protected get host(): UiHost | null {
    return uiHostOf(this);
  }

  /**
   * Hit-tested by Pixi, and every press on it is kept from the world. A widget whose drawing has gaps (a scroll
   * view, an empty panel) also sets a `hitArea` over its box, so a press between its pieces is not the world's.
   */
  protected makeInteractive(): void {
    this.eventMode = 'static';
    this.on('pointerdown', consumePress);
  }

  /**
   * A child widget's box changed size by itself (a `Label` given a longer text). A widget that places a child by its
   * size (a `Button` centring its content) lays it out again here; the default does nothing, so a `Stack` still waits
   * for its `layout()` and a change does not ripple up through every container.
   */
  protected childResized(_child: Widget): void {}

  /** Tells the parent widget this one's box changed size by itself. */
  protected notifyResized(): void {
    const p = this.parent;
    if (p instanceof Widget) p.childResized(this);
  }

  /** Draws the current size and state. */
  protected abstract redraw(): void;
}

/** A child's layout size: a widget's box, anything else its drawn bounds. */
export function sizeOf(c: Container): Size {
  if (c instanceof Widget) return { width: c.boxWidth, height: c.boxHeight };
  const b = c.getLocalBounds();
  return { width: b.maxX, height: b.maxY };
}
