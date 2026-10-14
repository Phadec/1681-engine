/** The few fields of a DOM element the decision reads; real elements fit, and tests pass plain objects. */
export interface ElementLike {
  readonly tagName?: string;
  readonly type?: string;
  readonly isContentEditable?: boolean;
  readonly parentElement?: ElementLike | null;
}

/** `<input>` types that take typing; the rest (checkbox, range, button…) are pressed, not typed into. */
const TYPED_INPUTS = new Set(['text', 'search', 'email', 'password', 'number', 'url', 'tel', 'date', 'time', 'datetime-local', 'month', 'week', '']);

/** Whether keys pressed on this element are typing (a text field, a text area, a select, editable content). */
export function isEditable(el: ElementLike | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && TYPED_INPUTS.has((el.type ?? '').toLowerCase());
}

/** Whether `el` is `root` or inside it. */
export function isInside(el: ElementLike | null | undefined, root: ElementLike): boolean {
  for (let e = el; e; e = e.parentElement) if (e === root) return true;
  return false;
}

export interface ShieldFacts {
  /** The event's target is in the DOM UI overlay. */
  insideUi: boolean;
  /** The target takes typing (`isEditable`). */
  editable: boolean;
  /** `KeyboardEvent.code`, for key events. */
  code?: string;
}

export interface ShieldOptions {
  /**
   * Keys a focused, non-typing UI element (a button) keeps from the game: the ones that press it (default Enter,
   * Space). Others still reach the game, so a button left focused after a click does not stop the hero walking.
   */
  uiKeys?: readonly string[];
}

const UI_KEYS = ['Enter', 'NumpadEnter', 'Space'];

/**
 * Whether an event on the DOM UI must be kept from the engine's input. Releases (`keyup`, `pointerup`,
 * `pointercancel`) always go through, or a key or button held when the UI took over would stay down for good; moves
 * go through so aiming follows the pointer over a panel. Presses, wheel and context menus on the UI stay in the UI,
 * and so does every key typed into a field.
 */
export function shouldShield(type: string, facts: ShieldFacts, options: ShieldOptions = {}): boolean {
  if (!facts.insideUi) return false;
  switch (type) {
    case 'keydown':
    case 'keypress':
      if (facts.editable) return true;
      return facts.code !== undefined && (options.uiKeys ?? UI_KEYS).includes(facts.code);
    case 'pointerdown':
    case 'mousedown':
    case 'touchstart':
    case 'click':
    case 'dblclick':
    case 'wheel':
    case 'contextmenu':
      return true;
    default:
      return false;
  }
}
