import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerChoice, askChoice, cancelChoice, choiceStore, firstChoice } from './choiceStore';
import { askConfirm, askQuantity, answerConfirm, cancelConfirm, confirmStore, parseQuantity } from './confirmStore';
import { glyphPath, hasGlyph, registerGlyph } from './Glyph';
import { fillLabel } from './labels';
import { stepOption } from './Select';
import { sliderKeyValue } from './Slider';
import { pickedEntry } from './usePicked';

test('the picked entry falls back to the first while nothing (or something gone) is picked', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  const key = (i: { id: string }) => i.id;
  assert.equal(pickedEntry(items, key, 'b')?.id, 'b');
  assert.equal(pickedEntry(items, key, null)?.id, 'a');
  assert.equal(pickedEntry(items, key, 'gone')?.id, 'a');
  assert.equal(pickedEntry(items, key, null, false), null);
  assert.equal(pickedEntry([], key, null), null);
});

test('select keys wrap round the list', () => {
  assert.equal(stepOption(0, -1, 3), 2);
  assert.equal(stepOption(2, 1, 3), 0);
  assert.equal(stepOption(-1, 1, 3), 1);
  assert.equal(stepOption(0, 1, 0), 0);
});

test('slider keys move by a step, a page of four, or to the ends, held in range', () => {
  assert.equal(sliderKeyValue('ArrowRight', 0.5, 0, 1, 0.1), 0.6);
  assert.equal(sliderKeyValue('PageDown', 0.5, 0, 1, 0.1), 0.1);
  assert.equal(sliderKeyValue('ArrowUp', 1, 0, 1, 0.1), 1);
  assert.equal(sliderKeyValue('End', 3, 1, 9, 1), 9);
  assert.equal(sliderKeyValue('a', 3, 1, 9, 1), undefined);
});

test('a typed quantity is held to 1..max', () => {
  assert.equal(parseQuantity('37', 99), 37);
  assert.equal(parseQuantity('3a7', 99), 37);
  assert.equal(parseQuantity('', 99), 1);
  assert.equal(parseQuantity('500', 99), 99);
});

test('labels fill their placeholders', () => {
  assert.equal(fillLabel('Close {0}', 'Bag'), 'Close Bag');
  assert.equal(fillLabel('{1} of {0}', 'a'), '{1} of a');
});

test('a confirm resolves true, a quantity its amount, and a new question cancels the old one', async () => {
  const yes = askConfirm('Sure?');
  assert.equal(confirmStore.getState().pending?.max, 0);
  answerConfirm(1);
  assert.equal(await yes, true);
  const first = askQuantity('How many?', 12.7);
  assert.equal(confirmStore.getState().pending?.max, 12);
  const second = askConfirm('Other?', { ok: 'Yes' });
  assert.equal(await first, 0);
  assert.equal(confirmStore.getState().pending?.ok, 'Yes');
  assert.equal(cancelConfirm(), true);
  assert.equal(await second, false);
  assert.equal(cancelConfirm(), false);
});

test('a choice resolves the id picked, or null when cancelled', async () => {
  const options = [{ id: 'x', label: 'X', disabled: true }, { id: 'y', label: 'Y' }];
  assert.equal(firstChoice(options), 'y');
  const pick = askChoice('Which?', options);
  answerChoice('y');
  assert.equal(await pick, 'y');
  const gone = askChoice('Which?', options);
  assert.equal(cancelChoice(), true);
  assert.equal(await gone, null);
  assert.equal(choiceStore.getState().pending, null);
});

test('glyphs are built in, registrable, and drawn as 1x1 cells', () => {
  assert.equal(hasGlyph('close'), true);
  assert.equal(glyphPath(['X.', '.X'], 'X'), 'M0 0h1v1h-1zM1 1h1v1h-1z');
  registerGlyph('test_coin', { rows: ['.o.', 'oMo', '.o.'], tones: { o: '#000', M: '#fc0' } });
  assert.equal(hasGlyph('test_coin'), true);
});

test('the base stylesheet keeps the pixel rules: no translate centring, zoom, gradient or blur', async () => {
  const { baseCss, injectBaseCss } = await import('./baseCss');
  assert.doesNotMatch(baseCss, /translate|zoom|gradient|blur\(|text-shadow/);
  assert.equal(injectBaseCss(undefined), null);
});
