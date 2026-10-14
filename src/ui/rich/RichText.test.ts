import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import type { TextureRegistry } from '../../core/TextureRegistry';
import type { RichFont } from './richFonts';
import type { RichStyle } from './richMarkup';
import { RichText } from './RichText';

/** A run that records what it was asked to show. */
class FakeRun extends Container {
  shown = '';
  updates = 0;
}

function fakeFont(): RichFont & { made: number } {
  return {
    made: 0,
    textWidth: (t: string) => t.length * 6,
    lineHeight: (s: RichStyle) => (s.size ?? 10) + 2,
    createRun() {
      this.made++;
      return new FakeRun();
    },
    updateRun(run: Container, text: string) {
      const r = run as FakeRun;
      r.shown = text;
      r.updates++;
    },
  };
}

const icon = new Texture({ source: new TextureSource({ width: 4, height: 4 }) });
const textures = { get: () => icon } as unknown as TextureRegistry;

function shownRuns(t: RichText): string[] {
  return t.children.filter((c): c is FakeRun => c instanceof FakeRun && c.visible).map((c) => c.shown);
}

test('a rich text measures its box and shows one run per styled piece of a line', () => {
  const font = fakeFont();
  const t = new RichText('hello [b]bold[/b] [icon=coin]', { font, textures, wrapWidth: 1000 });
  assert.deepEqual(shownRuns(t), ['hello ', 'bold', ' ']);
  assert.equal(t.boxWidth, 1000);
  const sprites = t.children.filter((c) => c instanceof Sprite && c.visible);
  assert.equal(sprites.length, 1);
});

test('changing the text reuses runs, and the same text again does nothing', () => {
  const font = fakeFont();
  const t = new RichText('a [b]b[/b] c', { font });
  assert.equal(font.made, 3);
  t.setText('x [b]y[/b]');
  assert.equal(font.made, 3);
  assert.deepEqual(shownRuns(t), ['x ', 'y']);
  const before = (t.children[0] as FakeRun).updates;
  t.setText('x [b]y[/b]');
  assert.equal((t.children[0] as FakeRun).updates, before);
  t.setText('one\ntwo\nthree\nfour');
  assert.equal(font.made, 4);
  assert.deepEqual(shownRuns(t), ['one', 'two', 'three', 'four']);
});

test('wrap width and alignment lay it out again; the caller\'s options are not changed', () => {
  const font = fakeFont();
  const options = { font, align: 'left' as const };
  const t = new RichText('aaa bbb', options);
  assert.equal(t.layout.lines.length, 1);
  t.setWrapWidth(30);
  assert.equal(t.layout.lines.length, 2);
  t.setAlign('right');
  assert.equal(t.layout.lines[0]!.items[0]!.x, 12);
  assert.equal(options.align, 'left');
  assert.equal('wrapWidth' in options, false);
});

test('without a texture registry icons take no room', () => {
  const t = new RichText('[icon=coin]x', { font: fakeFont() });
  assert.equal(t.boxWidth, 6);
});
