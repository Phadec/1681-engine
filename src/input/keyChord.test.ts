import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chordHeld, parseChord } from './keyChord.ts';

test('chords parse modifiers before the code; plain keys and unknown modifiers are not chords', () => {
  assert.equal(parseChord('Tab'), null);
  assert.equal(parseChord('NumpadAdd'), null);
  assert.equal(parseChord('Hyper+KeyA'), null);
  assert.equal(parseChord('Shift+'), null);
  const c = parseChord('Ctrl+Shift+KeyZ')!;
  assert.equal(c.code, 'KeyZ');
  assert.equal(c.modifiers.length, 2);
  const down = new Set(['ControlRight', 'ShiftLeft', 'KeyZ']);
  assert.equal(chordHeld(c, (k) => down.has(k)), true);
  down.delete('ShiftLeft');
  assert.equal(chordHeld(c, (k) => down.has(k)), false);
});
