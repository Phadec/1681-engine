import { PAD_BUTTONS, type PadState } from './Actions';

/** What kind of input a binding is: a key (or chord), a gamepad button or stick half, or a touch button. */
export type InputDevice = 'keys' | 'pad' | 'touch';

export function deviceOf(binding: string): InputDevice {
  return binding.startsWith('pad:') ? 'pad' : binding.startsWith('touch:') ? 'touch' : 'keys';
}

const AXES = ['lx', 'ly', 'rx', 'ry'] as const;

const PAD_NAMES: Readonly<Record<string, string>> = {
  a: 'A',
  b: 'B',
  x: 'X',
  y: 'Y',
  lb: 'LB',
  rb: 'RB',
  lt: 'LT',
  rt: 'RT',
  select: 'Select',
  start: 'Start',
  ls: 'Left stick press',
  rs: 'Right stick press',
  up: 'D-pad up',
  down: 'D-pad down',
  left: 'D-pad left',
  right: 'D-pad right',
  home: 'Home',
  'lx-': 'Left stick left',
  'lx+': 'Left stick right',
  'ly-': 'Left stick up',
  'ly+': 'Left stick down',
  'rx-': 'Right stick left',
  'rx+': 'Right stick right',
  'ry-': 'Right stick up',
  'ry+': 'Right stick down',
};

/**
 * How a gamepad binding reads on screen: `pad:a` is "A", `pad:lx-` "Left stick left". `names` overrides any (a
 * PlayStation game's "Cross", the game's own language); a binding that is not a pad's comes back as it is.
 */
export function padLabel(binding: string, names: Readonly<Record<string, string>> = {}): string {
  if (!binding.startsWith('pad:')) return binding;
  const what = binding.slice(4);
  return names[what] ?? PAD_NAMES[what] ?? what;
}

export interface CaptureOptions {
  /** Which devices may answer (default keys and pad). */
  devices?: readonly ('keys' | 'pad')[];
  /** Key codes that do not count (default Escape: it cancels instead). */
  ignoreKeys?: readonly string[];
  /** Key codes that cancel the capture (default Escape; the pad's Start and B are buttons like any other). */
  cancelKeys?: readonly string[];
  /** A stick half counts once pushed past this (default 0.6), so a resting stick's drift never binds. */
  axisThreshold?: number;
  /** Where key presses are heard (default `window`). */
  target?: EventTarget;
  /** Where gamepads come from (default `navigator.getGamepads`). */
  gamepads?: () => readonly (PadState | null)[];
}

/**
 * Waits for the next input the player gives, for a settings screen's "press a key for Jump": the next key (its
 * `KeyboardEvent.code`), gamepad button or stick half pushed past a threshold, as a binding string `Actions` and
 * `Keymap` take. Inputs already held when the capture began do not count until let go, so the press that opened the
 * capture (Enter, the pad's A) does not bind itself.
 *
 * Call `poll()` once a frame for the gamepad (the browser has no gamepad events worth trusting); keys are heard as
 * they come. The promise resolves to the binding, or null when cancelled (Escape, or `cancel()`).
 */
export class InputCapture {
  readonly result: Promise<string | null>;
  private settle!: (binding: string | null) => void;
  private done = false;
  private readonly held = new Set<string>();
  private readonly options: Required<Omit<CaptureOptions, 'target' | 'gamepads'>>;
  private readonly gamepads: () => readonly (PadState | null)[];
  private readonly target: EventTarget | null;
  private readonly onKey = (e: Event) => this.key(e as KeyboardEvent);

  constructor(options: CaptureOptions = {}) {
    this.options = {
      devices: options.devices ?? ['keys', 'pad'],
      ignoreKeys: options.ignoreKeys ?? ['Escape'],
      cancelKeys: options.cancelKeys ?? ['Escape'],
      axisThreshold: options.axisThreshold ?? 0.6,
    };
    this.gamepads =
      options.gamepads ?? (() => (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []));
    this.target = options.target ?? (typeof window !== 'undefined' ? window : null);
    this.result = new Promise((resolve) => (this.settle = resolve));
    // what is held now is the press that opened the capture, not an answer
    for (const b of this.padInputs()) this.held.add(b);
    if (this.options.devices.includes('keys')) this.target?.addEventListener('keydown', this.onKey, { capture: true });
  }

  /** Reads the gamepads once; call every frame while the capture is open. */
  poll(): void {
    if (this.done || !this.options.devices.includes('pad')) return;
    const now = new Set(this.padInputs());
    for (const b of now) {
      if (this.held.has(b)) continue;
      return this.finish(b);
    }
    // something let go may count again when pressed anew
    for (const b of [...this.held]) if (!now.has(b)) this.held.delete(b);
  }

  /** Stops waiting; the result is null. */
  cancel(): void {
    this.finish(null);
  }

  get open(): boolean {
    return !this.done;
  }

  private key(e: KeyboardEvent): void {
    if (this.done || e.repeat) return;
    // the key is the capture's: it neither types nor reaches the game's own handlers
    e.preventDefault();
    e.stopImmediatePropagation();
    if (this.options.cancelKeys.includes(e.code)) return this.finish(null);
    if (this.options.ignoreKeys.includes(e.code) || !e.code) return;
    this.finish(e.code);
  }

  private finish(binding: string | null): void {
    if (this.done) return;
    this.done = true;
    this.target?.removeEventListener('keydown', this.onKey, { capture: true });
    this.settle(binding);
  }

  /** Every pad input down on any pad now, as bindings. */
  private padInputs(): string[] {
    const out: string[] = [];
    for (const pad of this.gamepads()) {
      if (!pad) continue;
      pad.buttons.forEach((b, i) => {
        // a trigger counts once pulled past the threshold, like a stick
        if ((b.pressed || b.value > this.options.axisThreshold) && PAD_BUTTONS[i]) out.push(`pad:${PAD_BUTTONS[i]}`);
      });
      AXES.forEach((name, i) => {
        const v = pad.axes[i] ?? 0;
        if (v > this.options.axisThreshold) out.push(`pad:${name}+`);
        else if (v < -this.options.axisThreshold) out.push(`pad:${name}-`);
      });
    }
    return out;
  }
}
