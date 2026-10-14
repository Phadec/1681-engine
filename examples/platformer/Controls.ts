import { Actions, Keyboard, Keymap, keyLabel, keymapStorage, type Bindings } from '../../src';

/** What the hero does. `pause` is in the keymap too, so one `Actions` reads all of a level's input. */
export type PlayAction = 'left' | 'right' | 'down' | 'jump' | 'pause';

/** What the canvas UI reads (`UiRoot`'s default action names). */
export type UiAction = 'ui_up' | 'ui_down' | 'ui_left' | 'ui_right' | 'ui_accept' | 'ui_cancel' | 'ui_next' | 'ui_prev';

const PLAY_KEYS: Record<PlayAction, readonly string[]> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'ArrowUp', 'KeyW'],
  pause: ['KeyP'],
};

/**
 * The inputs the player does not rebind: the gamepad's, and Escape for pause — the keymap reserves Escape for menus,
 * so the player can never put it on another action, but as a fixed input it always pauses.
 */
const PLAY_FIXED: Partial<Record<PlayAction, readonly string[]>> = {
  left: ['pad:left', 'pad:lx-'],
  right: ['pad:right', 'pad:lx+'],
  down: ['pad:down', 'pad:ly+'],
  jump: ['pad:a'],
  pause: ['Escape', 'pad:start'],
};

export const UI_BINDINGS: Bindings<UiAction> = {
  ui_up: ['ArrowUp', 'KeyW', 'pad:up', 'pad:ly-'],
  ui_down: ['ArrowDown', 'KeyS', 'pad:down', 'pad:ly+'],
  ui_left: ['ArrowLeft', 'KeyA', 'pad:left', 'pad:lx-'],
  ui_right: ['ArrowRight', 'KeyD', 'pad:right', 'pad:lx+'],
  ui_accept: ['Enter', 'Space', 'pad:a'],
  ui_cancel: ['Escape', 'pad:b', 'pad:start'],
  ui_next: ['Tab'],
  ui_prev: ['Shift+Tab'],
};

/**
 * The player's key bindings: one `Keymap` for the whole game, saved in localStorage the moment it changes, and
 * handed to whichever `Actions` the running level owns.
 */
export class Controls {
  readonly keymap = new Keymap<PlayAction>(PLAY_KEYS, undefined, PLAY_FIXED);
  private readonly storage = keymapStorage('platformer.keys');

  constructor() {
    this.keymap.load(this.storage.read());
    this.keymap.onChange(() => this.storage.write(this.keymap.toJSON()));
  }

  /** A fresh `Actions` for a level, kept on the keymap until the returned stop is called. */
  playActions(keyboard: Keyboard): { actions: Actions<PlayAction>; stop: () => void } {
    const actions = new Actions<PlayAction>(keyboard, { left: [], right: [], down: [], jump: [], pause: [] });
    const apply = () => this.keymap.applyTo(actions);
    apply();
    return { actions, stop: this.keymap.onChange(apply) };
  }

  /** How the jump key reads on screen. */
  jumpLabel(): string {
    const code = this.keymap.keysFor('jump')[0];
    return code ? keyLabel(code) : '-';
  }
}
