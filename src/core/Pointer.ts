import type { Camera } from './Camera';
import { isTouchUi } from '../platform/touch';

/** MouseEvent.button (0 left, 1 middle, 2 right) as a MouseEvent.buttons bit. */
function buttonBit(button: number): number {
  return button === 1 ? 4 : button === 2 ? 2 : button === 0 ? 1 : 0;
}

/**
 * The mouse over the game canvas. Presses count only when they start on the canvas (not on the React UI above it);
 * moves are followed everywhere so aiming keeps working at the edge of a panel.
 */
export class Pointer {
  /**
   * A press this returns true for is not counted as a held button (e.g. Shift + right-click opening a context menu
   * instead of firing what the right button is bound to). Unset, every press counts.
   */
  static ignorePress: ((e: PointerEvent) => boolean) | null = null;

  /** Screen position relative to the canvas, in CSS pixels. */
  x = 0;
  y = 0;
  worldX = 0;
  worldY = 0;
  private buttons = 0;
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    // with the on-screen controls a finger on the world is not a mouse: it would swing at every tap and drag the
    // aim after the joystick thumb (touch controls aim on their own). A real mouse still works.
    const fingers = isTouchUi();
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void) => {
      const handler = (e: WindowEventMap[K]) => {
        if (fingers && e instanceof PointerEvent && e.pointerType === 'touch') return;
        fn(e);
      };
      target.addEventListener(type, handler as EventListener);
      this.cleanup.push(() => target.removeEventListener(type, handler as EventListener));
    };
    // Pointer events, since Pixi's event system cancels the mouse events that follow them. Read `button` (the one
    // that changed), not `buttons`: synthetic input (CDP) leaves `buttons` at 0.
    on(canvas, 'pointerdown', (e) => {
      this.track(e);
      if (Pointer.ignorePress?.(e)) return;
      this.buttons |= buttonBit(e.button);
    });
    on(window, 'pointermove', (e) => {
      this.track(e);
      // a second button pressed or released while one is held arrives as a move
      if (e.button >= 0) this.buttons = (e.buttons & buttonBit(e.button)) !== 0 ? this.buttons | buttonBit(e.button) : this.buttons & ~buttonBit(e.button);
    });
    on(window, 'pointerup', (e) => {
      this.buttons &= ~buttonBit(e.button);
    });
    on(window, 'blur', () => {
      this.buttons = 0;
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
  }

  leftButtonDown(): boolean {
    return (this.buttons & 1) !== 0;
  }

  rightButtonDown(): boolean {
    return (this.buttons & 2) !== 0;
  }

  updateWorldPoint(cam: Camera): void {
    this.worldX = cam.scrollX + this.x / cam.zoom;
    this.worldY = cam.scrollY + this.y / cam.zoom;
  }

  destroy(): void {
    for (const fn of this.cleanup) fn();
    this.cleanup.length = 0;
  }

  private track(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.x = e.clientX - r.left;
    this.y = e.clientY - r.top;
  }
}
