import { isEditable, isInside, shouldShield, type ShieldOptions } from './shieldDecision';

/** The events checked on their way up out of the overlay. */
const EVENTS = ['keydown', 'keypress', 'pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick', 'wheel', 'contextmenu'] as const;

/**
 * Keeps input meant for the DOM UI from reaching the engine. It listens on the overlay's root as events bubble out
 * of it and stops the ones `shouldShield` names, so the element under them still gets them (a text field still
 * types) but listeners on the window and document (`Keyboard`, a game's own) never hear them.
 *
 * Presses on the overlay never reach `Pointer` anyway, which counts presses only on the canvas; the shield covers
 * keys, wheel and window-level listeners. Releases always pass, or a key held when a field took focus would stick.
 */
export class InputShield {
  private readonly handler = (e: Event) => this.check(e);

  constructor(
    private readonly root: HTMLElement,
    private readonly options: ShieldOptions = {},
  ) {
    for (const type of EVENTS) root.addEventListener(type, this.handler, { passive: false });
  }

  /** Whether the player is typing in a field of the UI now (a game may also skip its hotkeys). */
  get typing(): boolean {
    const active = this.root.ownerDocument.activeElement;
    return isEditable(active as HTMLElement | null) && isInside(active as HTMLElement | null, this.root);
  }

  destroy(): void {
    for (const type of EVENTS) this.root.removeEventListener(type, this.handler);
  }

  private check(e: Event): void {
    const target = e.target as HTMLElement | null;
    const code = (e as KeyboardEvent).code;
    const facts = { insideUi: isInside(target, this.root), editable: isEditable(target), ...(code === undefined ? {} : { code }) };
    if (shouldShield(e.type, facts, this.options)) e.stopPropagation();
  }
}
