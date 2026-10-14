import type { Container } from 'pixi.js';
import { firstFocus, linearFocus, nextFocus, type NavDirection } from './layout/focusNav';
import type { Rect } from './layout/geometry';
import { Widget } from './Widget';

/** Anything that answers `pressed(action)`: the engine's `Actions`, or a game's own input. */
export interface NavInput {
  pressed(action: string): boolean;
}

/** The action names the UI reads; a game binds them in its `Actions` (`ui_up: ['ArrowUp', 'pad:up', 'pad:ly-']`…). */
export interface NavBindings {
  up: string;
  down: string;
  left: string;
  right: string;
  accept: string;
  cancel: string;
  /** Tab order, for a keyboard. */
  next: string;
  prev: string;
}

export const DEFAULT_NAV: NavBindings = {
  up: 'ui_up',
  down: 'ui_down',
  left: 'ui_left',
  right: 'ui_right',
  accept: 'ui_accept',
  cancel: 'ui_cancel',
  next: 'ui_next',
  prev: 'ui_prev',
};

/** A container focus is kept inside (a dialog's trap), and what Cancel does there. */
interface Scope {
  container: Container;
  onCancel: (() => boolean) | null;
}

const DIRECTIONS: readonly NavDirection[] = ['up', 'down', 'left', 'right'];

/**
 * Keyboard and gamepad navigation between widgets: directions move spatially (to the nearest widget that way), Tab
 * steps in tree order, Accept activates, Cancel asks the innermost scope. A modal pushes a scope, and focus cannot
 * leave it until it is popped (the focus trap). The list of focusable widgets is collected only when stale.
 */
export class FocusManager {
  private readonly scopes: Scope[] = [];
  private list: Widget[] | null = null;
  private current: Widget | null = null;

  constructor(
    root: Container,
    readonly bindings: NavBindings = DEFAULT_NAV,
  ) {
    this.scopes.push({ container: root, onCancel: null });
  }

  get focused(): Widget | null {
    return this.current;
  }

  /** The focusable widgets changed (added, removed, shown, hidden, enabled): collect them again on the next move. */
  invalidate(): void {
    this.list = null;
    if (this.current && (this.current.destroyed || !this.current.canFocus() || !this.inScope(this.current))) this.focus(null);
  }

  /** Traps focus inside `container` until `popScope`; `onCancel` answers Cancel there (true when it used it). */
  pushScope(container: Container, onCancel: (() => boolean) | null = null): void {
    this.scopes.push({ container, onCancel });
    this.list = null;
    this.focus(null);
  }

  popScope(container: Container): void {
    const i = this.scopes.findIndex((s) => s.container === container);
    if (i <= 0) return;
    this.scopes.splice(i);
    this.list = null;
    this.focus(null);
  }

  /** The innermost scope's container (the open dialog, or the root). */
  get scope(): Container {
    return this.scopes[this.scopes.length - 1]!.container;
  }

  focus(w: Widget | null): void {
    if (w === this.current) return;
    this.current?.setFocused(false);
    this.current = w;
    if (!w) return;
    w.setFocused(true);
    // a scroll view holding it brings it into view
    for (let p = w.parent; p; p = p.parent) (p as { reveal?: (c: Widget) => void }).reveal?.(w);
  }

  /** Moves focus one way; the first press with nothing focused lands on the top-left widget. */
  move(dir: NavDirection): boolean {
    const list = this.widgets();
    if (list.length === 0) return false;
    const rects = list.map(rectOf);
    const i = this.current ? list.indexOf(this.current) : -1;
    const next = i < 0 ? firstFocus(rects) : nextFocus(rects, i, dir);
    if (next < 0 || next === i) return false;
    this.focus(list[next]!);
    return true;
  }

  /** Tab (1) or Shift+Tab (−1), in tree order, wrapping. */
  step(step: 1 | -1): boolean {
    const list = this.widgets();
    if (list.length === 0) return false;
    const i = this.current ? list.indexOf(this.current) : -1;
    this.focus(list[linearFocus(list.length, i, step)]!);
    return true;
  }

  /**
   * Reads one step of input; call it between the game's `actions.poll()` and `endStep()`. True when the UI used a
   * press, so the game leaves it alone.
   */
  handle(input: NavInput): boolean {
    const b = this.bindings;
    let used = false;
    for (const dir of DIRECTIONS) {
      if (!input.pressed(b[dir])) continue;
      // a focused widget may use the direction itself (a slider steps on left/right)
      used = (this.current?.navigate(dir) ?? false) || this.move(dir) || used;
    }
    if (input.pressed(b.next)) used = this.step(1) || used;
    if (input.pressed(b.prev)) used = this.step(-1) || used;
    if (input.pressed(b.accept) && this.current?.canFocus()) {
      this.current.activate();
      used = true;
    }
    if (input.pressed(b.cancel)) {
      const scope = this.scopes[this.scopes.length - 1]!;
      if (scope.onCancel?.()) used = true;
      else if (this.current) {
        this.focus(null);
        used = true;
      }
    }
    return used;
  }

  private inScope(w: Container): boolean {
    for (let p: Container | null = w; p; p = p.parent) if (p === this.scope) return true;
    return false;
  }

  private widgets(): Widget[] {
    if (!this.list) {
      const out: Widget[] = [];
      collect(this.scope, out);
      this.list = out;
    }
    return this.list.filter((w) => !w.destroyed && w.canFocus());
  }
}

function collect(c: Container, out: Widget[]): void {
  if (!c.visible) return;
  if (c instanceof Widget && c.focusable) out.push(c);
  for (const child of c.children) collect(child, out);
}

/** A widget's box on screen: comparable across parents, whatever scrolled or scaled them. */
function rectOf(w: Widget): Rect {
  const b = w.getBounds();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}
