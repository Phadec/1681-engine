import type { Actions } from './Actions';
import { deviceOf, type InputDevice } from './InputCapture';

/**
 * Which keys each action sits on, as the player has rebound them: one table the input, the key hints on screen and
 * a settings screen all read. A binding is a `KeyboardEvent.code` (`KeyW`, `Digit1`), so it means the same physical
 * key on every layout. Each action keeps a list (W and ArrowUp, 1 and Q); a settings screen edits the **first** and
 * leaves the alternates alone. Gamepad inputs (`pad:a`, `pad:lx-`) may be the player's too: each device keeps its own
 * first binding, so a settings screen with a keys column and a pad column edits each without touching the other.
 *
 * Two rules: one key serves one action at a time (a key bound twice would fire both, and the player could not tell
 * which they meant), and reserved keys (Escape, Enter, Tab by default: the interface's own) are never taken.
 *
 * Inputs the player cannot rebind — the gamepad's, a touch button, a reserved key an action should still answer to
 * (Escape also pausing) — are the keymap's **fixed** inputs: given once to the constructor, laid after the player's
 * keys by `applyTo`, and untouched by either rule above.
 *
 * ```ts
 * const keys = new Keymap({ jump: ['Space'], left: ['KeyA', 'ArrowLeft'], pause: ['KeyP'] }, undefined, { jump: ['pad:a'], pause: ['Escape'] });
 * keys.load(keymapStorage('my-game.keys').read());
 * keys.onChange(() => { keys.applyTo(actions); storage.write(keys.toJSON()); });
 * keys.bind('pause', 'KeyA'); // 'left' keeps only ArrowLeft
 * ```
 */
export class Keymap<A extends string> {
  private binds: Record<A, string[]>;
  private readonly defaults: Record<A, readonly string[]>;
  private readonly reserved: ReadonlySet<string>;
  private readonly fixed: Partial<Record<A, readonly string[]>>;
  private readonly listeners: (() => void)[] = [];

  /**
   * `reserved`: keys never bound (default Escape, Enter, Tab; pass `undefined` for the default). `fixed`: inputs each
   * action always has besides the player's keys (gamepad, touch, a reserved key), never saved or rebound.
   */
  constructor(
    defaults: Readonly<Record<A, readonly string[]>>,
    reserved: Iterable<string> = ['Escape', 'Enter', 'Tab'],
    fixed: Partial<Record<A, readonly string[]>> = {},
  ) {
    this.defaults = { ...defaults };
    this.reserved = new Set(reserved);
    this.fixed = { ...fixed };
    this.binds = this.fresh();
  }

  private fresh(): Record<A, string[]> {
    const out = {} as Record<A, string[]>;
    for (const id of this.actions()) out[id] = this.defaults[id].filter((c) => !this.reserved.has(c));
    return out;
  }

  /** Every action, in the order the defaults named them. */
  actions(): A[] {
    return Object.keys(this.defaults) as A[];
  }

  isReserved(code: string): boolean {
    return this.reserved.has(code);
  }

  /**
   * The bindings of one action, or only those of one device; the first of a device is the one a settings screen
   * shows and edits.
   */
  keysFor(action: A, device?: InputDevice): readonly string[] {
    const all = this.binds[action] ?? [];
    return device ? all.filter((c) => deviceOf(c) === device) : all;
  }

  /** The inputs an action always has besides the player's keys (the constructor's `fixed`). */
  fixedFor(action: A): readonly string[] {
    return this.fixed[action] ?? [];
  }

  /** Which action a key belongs to, or undefined. */
  actionFor(code: string): A | undefined {
    for (const id of this.actions()) if (this.binds[id].includes(code)) return id;
    return undefined;
  }

  /**
   * Puts `code` first on `action` in place of the action's first binding of the same device (a key replaces its first
   * key, a pad input its first pad input), taking it off whatever else held it; returns the actions that lost it (to
   * tell the player). A reserved key is refused (returns null). An action stripped of its last key keeps none: it is
   * unbound until something is put back on it.
   */
  bind(action: A, code: string): A[] | null {
    if (this.reserved.has(code) || !(action in this.binds)) return null;
    const lost: A[] = [];
    for (const id of this.actions()) {
      if (id === action || !this.binds[id].includes(code)) continue;
      this.binds[id] = this.binds[id].filter((c) => c !== code);
      lost.push(id);
    }
    const device = deviceOf(code);
    const replaced = this.binds[action].find((c) => deviceOf(c) === device);
    const rest = this.binds[action].filter((c) => c !== replaced && c !== code);
    this.binds[action] = [code, ...rest];
    this.changed();
    return lost;
  }

  /** Takes every key off `action`. */
  unbind(action: A): void {
    if (!this.binds[action]?.length) return;
    this.binds[action] = [];
    this.changed();
  }

  /** Every action back on its defaults. */
  reset(): void {
    this.binds = this.fresh();
    this.changed();
  }

  /** A plain object to store wherever the game keeps its settings. */
  toJSON(): Record<A, string[]> {
    const out = {} as Record<A, string[]>;
    for (const id of this.actions()) out[id] = [...this.binds[id]];
    return out;
  }

  /**
   * A saved set laid over this build's defaults. Only actions this build knows are read, so an old save cannot leave
   * a key bound to nothing; an action newer than the save keeps its defaults only where no saved action holds that key
   * (the saved one is what the player chose). Anything malformed is ignored.
   */
  load(saved: unknown): void {
    this.binds = mergeKeymap(this.defaults, saved, this.reserved);
    this.changed();
  }

  /**
   * Hands the bindings to an `Actions`: each action's keys, then its fixed inputs, then its `extra` ones. Only the
   * keymap's actions are bound, so the `Actions` may hold more (menu actions alongside the rebindable ones, each on
   * its own fixed inputs); those are left as they are. Fixed and extra inputs are the game's, so neither the reserved
   * keys nor one-key-one-action apply to them.
   */
  applyTo<B extends string>(actions: Actions<A | B>, extra: Partial<Record<A, readonly string[]>> = {}): void {
    for (const id of this.actions()) actions.bind(id, [...this.binds[id], ...(this.fixed[id] ?? []), ...(extra[id] ?? [])]);
  }

  /** Called after every change; returns a function that stops it. */
  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  private changed(): void {
    for (const fn of [...this.listeners]) fn();
  }
}

/** `saved` laid over `defaults` by `Keymap.load`'s rules, as a fresh object. */
export function mergeKeymap<A extends string>(
  defaults: Readonly<Record<A, readonly string[]>>,
  saved: unknown,
  reserved: ReadonlySet<string> = new Set(),
): Record<A, string[]> {
  const ids = Object.keys(defaults) as A[];
  const out = {} as Record<A, string[]>;
  const kept = new Set<A>();
  const s: Partial<Record<A, unknown>> = saved && typeof saved === 'object' ? (saved as Partial<Record<A, unknown>>) : {};
  for (const id of ids) {
    const codes = s[id];
    if (Array.isArray(codes) && codes.every((c) => typeof c === 'string')) {
      // a saved empty list is a choice too: the player unbound it
      out[id] = [...new Set(codes as string[])].filter((c) => !reserved.has(c));
      kept.add(id);
    } else out[id] = defaults[id].filter((c) => !reserved.has(c));
  }
  // one key one action, even in a hand-edited save: the first action listed keeps it
  const owner = new Map<string, A>();
  for (const id of ids)
    if (kept.has(id))
      out[id] = out[id].filter((c) => {
        if (owner.has(c)) return false;
        owner.set(c, id);
        return true;
      });
  for (const id of ids) if (!kept.has(id)) out[id] = out[id].filter((c) => !owner.has(c));
  return out;
}

/** A place to keep a keymap in the browser, under a key the game names; every failure falls back quietly. */
export function keymapStorage(key: string): { read(): unknown; write(binds: object): void; clear(): void } {
  const store = (): Storage | null => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  };
  return {
    read() {
      try {
        const raw = store()?.getItem(key);
        return raw ? (JSON.parse(raw) as unknown) : null;
      } catch {
        // unreadable or blocked storage: the defaults are a complete set on their own
        return null;
      }
    },
    write(binds) {
      try {
        store()?.setItem(key, JSON.stringify(binds));
      } catch {
        // storage unavailable: the change lasts until the page is reloaded
      }
    },
    clear() {
      try {
        store()?.removeItem(key);
      } catch {
        // nothing to clear
      }
    },
  };
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'Right Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Right Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Right Alt',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
};

/**
 * How a key code reads on screen: "KeyW" is W, "Digit1" is 1, "Numpad3" is "Num 3", a chord "Shift+Tab" each part in
 * turn. `names` overrides any code or modifier (a game's own language for the arrows and modifiers).
 */
export function keyLabel(code: string, names: Readonly<Record<string, string>> = {}): string {
  if (code.length > 1 && code.includes('+')) return code.split('+').map((part) => keyLabel(part, names)).join('+');
  const own = names[code];
  if (own !== undefined) return own;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return KEY_NAMES[code] ?? code;
}
