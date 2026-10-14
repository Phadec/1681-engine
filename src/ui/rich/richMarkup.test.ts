import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeRichText, parseRichText, stripRichText, type RichSpan } from './richMarkup';

const plain = { bold: false, italic: false };

function brief(spans: RichSpan[]): unknown[] {
  return spans.map((s) => (s.kind === 'icon' ? { icon: s.key, frame: s.frame, ...s.style } : { text: s.text, ...s.style }));
}

test('plain text is one span in the plain style', () => {
  assert.deepEqual(brief(parseRichText('Hello there')), [{ text: 'Hello there', ...plain }]);
  assert.deepEqual(parseRichText(''), []);
});

test('colour, bold, italic and size nest and close', () => {
  const spans = parseRichText('a [color=#f0c060]gold [b]bold [i]both[/i][/b][/color] [size=16]big[/size]');
  assert.deepEqual(brief(spans), [
    { text: 'a ', ...plain },
    { text: 'gold ', ...plain, color: '#f0c060' },
    { text: 'bold ', ...plain, color: '#f0c060', bold: true },
    { text: 'both', color: '#f0c060', bold: true, italic: true },
    { text: ' ', ...plain },
    { text: 'big', ...plain, size: 16 },
  ]);
});

test('icons take a key and an optional frame after the last colon, in the style around them', () => {
  const spans = parseRichText('[icon=coin] 50 [size=20][icon=sheet:items:12][/size]');
  assert.deepEqual(brief(spans), [
    { icon: 'coin', frame: undefined, ...plain },
    { text: ' 50 ', ...plain },
    { icon: 'sheet:items', frame: '12', ...plain, size: 20 },
  ]);
});

test('named colours come from the caller; unknown ones print as written', () => {
  assert.deepEqual(brief(parseRichText('[color=gold]x[/color]', { colors: { gold: '#ffd040' } })), [{ text: 'x', ...plain, color: '#ffd040' }]);
  assert.equal(stripRichText('[color=gold]x[/color]'), '[color=gold]x[/color]');
});

test('bad tags, stray closes and an unclosed bracket print as written', () => {
  assert.equal(stripRichText('[wave]hi[/wave]'), '[wave]hi[/wave]');
  assert.equal(stripRichText('[size=big]x'), '[size=big]x');
  assert.equal(stripRichText('[size=0]x'), '[size=0]x');
  assert.equal(stripRichText('[b=1]x'), '[b=1]x');
  assert.equal(stripRichText('[icon=]x'), '[icon=]x');
  assert.equal(stripRichText('x[/b]y'), 'x[/b]y');
  assert.equal(stripRichText('1 [ 2'), '1 [ 2');
  assert.equal(stripRichText('a [x [b]y[/b]'), 'a [x y');
  assert.equal(stripRichText(']'), ']');
});

test('[[ is a literal bracket, and escapeRichText makes player text inert', () => {
  assert.equal(stripRichText('[[b]not bold'), '[b]not bold');
  const name = 'Evil[b] [color=#f00]Bob';
  const spans = parseRichText(`[color=#0f0]${escapeRichText(name)}[/color] joined`);
  assert.equal(stripRichText(`[color=#0f0]${escapeRichText(name)}[/color] joined`), `${name} joined`);
  assert.ok(spans.every((s) => s.kind === 'text' && !s.style.bold));
});

test('an outer close closes what was opened inside it; unclosed tags end at the end', () => {
  const spans = parseRichText('[b][i]x[/b]y');
  assert.deepEqual(brief(spans), [
    { text: 'x', bold: true, italic: true },
    { text: 'y', ...plain },
  ]);
  assert.deepEqual(brief(parseRichText('[b]to the end')), [{ text: 'to the end', ...plain, bold: true }]);
});

test('tag names are case-blind and newlines pass through', () => {
  assert.deepEqual(brief(parseRichText('[B]a\nb[/B]')), [{ text: 'a\nb', ...plain, bold: true }]);
});
