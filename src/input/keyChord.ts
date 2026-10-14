/**
 * A key binding with modifiers: `Shift+Tab`, `Ctrl+KeyS`, `Ctrl+Shift+KeyZ`. The last part is the key's
 * `KeyboardEvent.code`; before it, any of `Shift`, `Ctrl`, `Alt`, `Meta`, either side of the keyboard counting.
 * A chord matches while its key and every modifier it names are held; modifiers it does not name are not looked at.
 */
export interface KeyChord {
  code: string;
  /** The modifiers' key codes, each a pair: either one held counts. */
  modifiers: readonly (readonly [string, string])[];
}

const MODIFIERS: Readonly<Record<string, readonly [string, string]>> = {
  Shift: ['ShiftLeft', 'ShiftRight'],
  Ctrl: ['ControlLeft', 'ControlRight'],
  Alt: ['AltLeft', 'AltRight'],
  Meta: ['MetaLeft', 'MetaRight'],
};

/** The chord a binding names, or null for a plain key (no `+`) or a malformed one (an unknown modifier). */
export function parseChord(binding: string): KeyChord | null {
  const parts = binding.split('+');
  if (parts.length < 2) return null;
  const code = parts[parts.length - 1]!;
  if (!code) return null;
  const modifiers: (readonly [string, string])[] = [];
  for (const name of parts.slice(0, -1)) {
    const pair = MODIFIERS[name];
    if (!pair) return null;
    modifiers.push(pair);
  }
  return { code, modifiers };
}

/** Whether `chord` is held, given which keys are down. */
export function chordHeld(chord: KeyChord, down: (code: string) => boolean): boolean {
  if (!down(chord.code)) return false;
  for (const [left, right] of chord.modifiers) if (!down(left) && !down(right)) return false;
  return true;
}
