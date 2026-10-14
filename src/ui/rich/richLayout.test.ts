import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutRichText, type RichMeasure } from './richLayout';
import { parseRichText, type RichStyle } from './richMarkup';

/** A monospace font: every letter 6 px at size 10 (scaled with size), lines 1.2 × the size, baseline at 0.8. */
const mono: RichMeasure = {
  textWidth: (t: string, s: RichStyle) => Array.from(t).length * 0.6 * (s.size ?? 10),
  lineHeight: (s) => 1.2 * (s.size ?? 10),
  ascent: (s) => 0.8 * 1.2 * (s.size ?? 10),
  iconSize: (key) => (key === 'coin' ? { width: 4, height: 4 } : { width: 8, height: 6 }),
};

function lines(markup: string, opts: Parameters<typeof layoutRichText>[2] = {}): string[] {
  return layoutRichText(parseRichText(markup), mono, opts).lines.map((l) => l.items.map((i) => (i.kind === 'text' ? i.text : `<${i.key}>`)).join('|'));
}

test('no wrap width: lines break only at newlines', () => {
  assert.deepEqual(lines('one two three\nfour'), ['one two three', 'four']);
  const l = layoutRichText(parseRichText('abc\n\nde'), mono);
  assert.equal(l.lines.length, 3);
  assert.equal(l.width, 18);
  assert.equal(l.height, 36);
});

test('words wrap at spaces; spaces at a break are dropped', () => {
  // 6 px a letter, 60 px a line: ten letters
  assert.deepEqual(lines('the quick brown fox jumps', { wrapWidth: 60 }), ['the quick', 'brown fox', 'jumps']);
  assert.deepEqual(lines('aaaa    bbbb', { wrapWidth: 50 }), ['aaaa', 'bbbb']);
});

test('leading spaces of a paragraph stay, trailing spaces of a line go', () => {
  const l = layoutRichText(parseRichText('  indent   \nnext'), mono);
  assert.equal(l.lines[0]!.items[0]!.kind === 'text' && l.lines[0]!.items[0]!.text, '  indent');
  assert.equal(l.lines[0]!.width, 48);
});

test('a word longer than the line breaks between letters', () => {
  assert.deepEqual(lines('abcdefghijklmnop', { wrapWidth: 36 }), ['abcdef', 'ghijkl', 'mnop']);
  assert.deepEqual(lines('xy abcdefghij', { wrapWidth: 36 }), ['xy', 'abcdef', 'ghij']);
});

test('a style change inside a word does not break it, and runs of one style merge', () => {
  const l = layoutRichText(parseRichText('gold[b]en[/b] age'), mono, { wrapWidth: 1000 });
  assert.deepEqual(
    l.lines[0]!.items.map((i) => i.kind === 'text' && [i.text, i.x]),
    [
      ['gold', 0],
      ['en', 24],
      [' age', 36],
    ],
  );
  assert.deepEqual(lines('gold[b]en[/b] ag', { wrapWidth: 36 }), ['gold|en', 'ag']);
});

test('an icon sticks to the word it touches and is scaled to the line', () => {
  assert.deepEqual(lines('pay [icon=coin]50 now', { wrapWidth: 40 }), ['pay', '<coin>|50', 'now']);
  const icon = layoutRichText(parseRichText('[icon=coin]'), mono).lines[0]!.items[0]!;
  assert.equal(icon.height, 12);
  assert.equal(icon.width, 12);
});

test('pixel-perfect icons scale by whole multiples, never below 1', () => {
  const at = (m: string) => layoutRichText(parseRichText(m), mono, { pixelPerfect: true }).lines[0]!.items[0]!;
  assert.equal(at('[icon=coin]').height, 12); // 12 / 4 = 3×
  assert.equal(at('[icon=big]').height, 12); // 12 / 6 = 2×
  assert.equal(at('[size=4][icon=big][/size]').height, 6); // 4.8 / 6 < 1: kept at 1×
  assert.equal(layoutRichText(parseRichText('[icon=coin]'), mono, { iconScale: 2 }).lines[0]!.items[0]!.height, 8);
});

test('mixed sizes share a baseline; the line is as tall as what it holds', () => {
  const l = layoutRichText(parseRichText('a[size=20]B[/size]'), mono);
  const [small, big] = l.lines[0]!.items;
  assert.equal(l.lines[0]!.height, 24);
  assert.equal(big!.y, 0);
  // baselines meet: small top + 9.6 = big top + 19.2
  assert.equal(small!.y + 9.6, big!.y + 19.2);
});

test('alignment uses the wrap width, or the widest line', () => {
  const centre = layoutRichText(parseRichText('ab\nabcd'), mono, { align: 'center' });
  assert.equal(centre.width, 24);
  assert.equal(centre.lines[0]!.items[0]!.x, 6);
  const right = layoutRichText(parseRichText('ab'), mono, { align: 'right', wrapWidth: 50 });
  assert.equal(right.width, 50);
  assert.equal(right.lines[0]!.items[0]!.x, 38);
});

test('line spacing goes between lines, not after the last', () => {
  const l = layoutRichText(parseRichText('a\nb'), mono, { lineSpacing: 3 });
  assert.equal(l.lines[1]!.y, 15);
  assert.equal(l.height, 27);
});

test('pixel-perfect layouts place everything on whole pixels', () => {
  const odd: RichMeasure = { ...mono, textWidth: (t) => t.length * 5.3, lineHeight: () => 11.5, ascent: () => 9.1 };
  const l = layoutRichText(parseRichText('ab [b]cd[/b] [icon=coin]\nx'), odd, { pixelPerfect: true, align: 'center' });
  for (const line of l.lines) {
    assert.ok(Number.isInteger(line.y) && Number.isInteger(line.height));
    for (const it of line.items) assert.ok(Number.isInteger(it.x) && Number.isInteger(it.y), `${it.x},${it.y}`);
  }
  assert.ok(Number.isInteger(l.width));
});

test('empty text is one empty line of the font', () => {
  const l = layoutRichText([], mono);
  assert.equal(l.lines.length, 1);
  assert.equal(l.height, 12);
  assert.equal(l.width, 0);
});
