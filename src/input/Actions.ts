import type { Keyboard } from './Keyboard';
import { chordHeld, parseChord, type KeyChord } from './keyChord';
import { rumblePad, type RumbleOptions, type RumblePad } from './rumble';

/**
 * Named actions bound to any input: keys, gamepad buttons and sticks, and virtual buttons a touch UI presses. Game
 * code asks for `'jump'`, never for `Space`, so players can rebind and every device works the same.
 *
 * ```ts
 * const input = new Actions(keyboard, {
 *   left: ['KeyA', 'ArrowLeft', 'pad:left', 'pad:lx-'],
 *   right: ['KeyD', 'ArrowRight', 'pad:right', 'pad:lx+'],
 *   jump: ['Space', 'pad:a'],
 * });
 * // in a fixed system:
 * input.poll();
 * if (input.pressed('jump')) …
 * const [x, y] = input.vector('left', 'right', 'up', 'down');
 * input.endStep();
 * ```
 *
 * Bindings: a `KeyboardEvent.code` (`KeyW`, `Space`, `ArrowUp`), a chord of modifiers and a code (`Shift+Tab`,
 * `Ctrl+KeyS`: `Shift`, `Ctrl`, `Alt`, `Meta`, either side), `pad:<button>` (standard mapping names below),
 * `pad:<axis>+` / `pad:<axis>-` for a stick half (`lx`, `ly`, `rx`, `ry`), or `touch:<name>` for a virtual button
 * (`press`/`release`).
 *
 * A chord wins over its bare key: while `Shift+Tab` is held, an action bound to plain `Tab` is not, and it stays off
 * until Tab itself comes up (letting Shift go first must not turn a Shift+Tab into a Tab). A bare key held with a
 * modifier no chord names still counts (Shift held to run does not stop the jump key).
 */
export type Bindings<A extends string> = Record<A, readonly string[]>;

/** Button names of the browser's standard gamepad mapping, in index order. */
export const PAD_BUTTONS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'select', 'start', 'ls', 'rs', 'up', 'down', 'left', 'right', 'home'] as const;
const PAD_AXES = ['lx', 'ly', 'rx', 'ry'] as const;

/** What the actions read from a gamepad; `navigator.getGamepads()` entries satisfy it. */
export interface PadState extends RumblePad {
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
  readonly axes: readonly number[];
}

export interface ActionsOptions {
  /** Stick values under this count as 0 (default 0.25). */
  deadZone?: number;
  /** Where gamepads come from (default `navigator.getGamepads`); tests pass their own. */
  gamepads?: () => readonly (PadState | null)[];
}

export class Actions<A extends string> {
  private bindings: Map<A, readonly string[]>;
  private readonly virtual = new Set<string>();
  private readonly virtualDown = new Set<string>();
  /** Analog value of each action this step (0–1), and last step's, for edges. */
  private now = new Map<A, number>();
  private before = new Map<A, number>();
  private readonly deadZone: number;
  private readonly gamepads: () => readonly (PadState | null)[];
  /** Parsed chords by binding string; null for a plain key. */
  private readonly chords = new Map<string, KeyChord | null>();
  /** Keys a chord holds this step: their bare bindings read 0 until the key comes up. */
  private readonly claimed = new Set<string>();
  private readonly keyDown = (code: string) => this.keyboard !== null && (this.keyboard.isDown(code) || this.keyboard.pressed(code));

  constructor(
    private readonly keyboard: Keyboard | null,
    bindings: Bindings<A>,
    options: ActionsOptions = {},
  ) {
    this.bindings = new Map(Object.entries(bindings) as [A, readonly string[]][]);
    this.deadZone = options.deadZone ?? 0.25;
    this.gamepads =
      options.gamepads ?? (() => (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []));
  }

  /** Replaces one action's bindings (a player's rebinding). */
  bind(action: A, inputs: readonly string[]): void {
    this.bindings.set(action, [...inputs]);
  }

  bindingsOf(action: A): readonly string[] {
    return this.bindings.get(action) ?? [];
  }

  /** A touch UI's virtual button went down: `touch:<name>` bindings read it. */
  press(name: string): void {
    this.virtual.add(name);
    this.virtualDown.add(name);
  }

  release(name: string): void {
    this.virtual.delete(name);
  }

  /**
   * Rumbles the gamepads the actions read: every connected one, or only `padIndex` among them. Resolves true when any
   * played; a pad without rumble is skipped silently.
   */
  async rumble(options: RumbleOptions, padIndex?: number): Promise<boolean> {
    const pads = this.gamepads();
    const chosen = padIndex === undefined ? pads : [pads[padIndex] ?? null];
    const played = await Promise.all(chosen.map((p) => (p ? rumblePad(p, options) : Promise.resolve(false))));
    return played.includes(true);
  }

  /** Reads every device once; call at the start of each simulation step. */
  poll(): void {
    [this.before, this.now] = [this.now, this.before];
    this.now.clear();
    const pads = this.gamepads().filter((p): p is PadState => p !== null);
    this.claimChords();
    for (const [action, inputs] of this.bindings) {
      let v = 0;
      for (const input of inputs) v = Math.max(v, this.read(input, pads));
      if (v > 0) this.now.set(action, v);
    }
  }

  /** Held this step. */
  down(action: A): boolean {
    return (this.now.get(action) ?? 0) > 0;
  }

  /** How far it is held (0–1): 1 for a key, the trigger or stick amount for analog input. */
  value(action: A): number {
    return this.now.get(action) ?? 0;
  }

  /** Went down this step. */
  pressed(action: A): boolean {
    return this.down(action) && !((this.before.get(action) ?? 0) > 0);
  }

  /** Came up this step. */
  released(action: A): boolean {
    return !this.down(action) && (this.before.get(action) ?? 0) > 0;
  }

  /** `value(positive) - value(negative)`, in −1…1. */
  axis(negative: A, positive: A): number {
    return this.value(positive) - this.value(negative);
  }

  /** A 2D direction from four actions, never longer than 1 (a diagonal is not faster). */
  vector(left: A, right: A, up: A, down: A): [number, number] {
    const x = this.axis(left, right);
    const y = this.axis(up, down);
    const len = Math.hypot(x, y);
    return len > 1 ? [x / len, y / len] : [x, y];
  }

  /** Ends the step: the keyboard forgets its edges; virtual taps shorter than a step have now been seen. */
  endStep(): void {
    this.keyboard?.endStep();
    this.virtualDown.clear();
  }

  /**
   * Drops every pending edge: what went down or up since the last step is forgotten, and what is held now counts as
   * already held, so the next `poll` reports no `pressed` or `released` for it. For input that sat unread while
   * something else had the keys (a pause menu over the level; `SceneManager.pop` calls it through `Scene.useInput`).
   */
  flush(): void {
    this.keyboard?.endStep();
    this.virtualDown.clear();
    this.poll();
    this.before = new Map(this.now);
  }

  private chordOf(input: string): KeyChord | null {
    let c = this.chords.get(input);
    if (c === undefined) {
      c = input.startsWith('pad:') || input.startsWith('touch:') ? null : parseChord(input);
      this.chords.set(input, c);
    }
    return c;
  }

  /** Marks the keys held chords use, and frees those whose key has come up. */
  private claimChords(): void {
    for (const code of this.claimed) if (!this.keyDown(code)) this.claimed.delete(code);
    if (!this.keyboard) return;
    for (const inputs of this.bindings.values())
      for (const input of inputs) {
        const chord = this.chordOf(input);
        if (chord && chordHeld(chord, this.keyDown)) this.claimed.add(chord.code);
      }
  }

  private read(input: string, pads: readonly PadState[]): number {
    if (input.startsWith('touch:')) {
      const name = input.slice(6);
      return this.virtual.has(name) || this.virtualDown.has(name) ? 1 : 0;
    }
    if (input.startsWith('pad:')) {
      const what = input.slice(4);
      let v = 0;
      const sign = what.endsWith('+') ? 1 : what.endsWith('-') ? -1 : 0;
      if (sign !== 0) {
        const axis = PAD_AXES.indexOf(what.slice(0, -1) as (typeof PAD_AXES)[number]);
        if (axis < 0) return 0;
        for (const p of pads) {
          const raw = (p.axes[axis] ?? 0) * sign;
          if (raw > this.deadZone) v = Math.max(v, (raw - this.deadZone) / (1 - this.deadZone));
        }
        return Math.min(1, v);
      }
      const button = PAD_BUTTONS.indexOf(what as (typeof PAD_BUTTONS)[number]);
      if (button < 0) return 0;
      // a digital button reports value 1 when pressed; an analog trigger its depth (some pads report 0 for a press)
      for (const p of pads) {
        const b = p.buttons[button];
        if (b?.pressed) v = Math.max(v, b.value > 0 ? b.value : 1);
      }
      return Math.min(1, v);
    }
    const chord = this.chordOf(input);
    if (chord) return chordHeld(chord, this.keyDown) ? 1 : 0;
    if (this.claimed.has(input)) return 0;
    return this.keyDown(input) ? 1 : 0;
  }
}
