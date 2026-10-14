import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Translator } from './Translator.ts';
import { formatMessage, sourceText } from './formatMessage.ts';

test('the source shows as written, with placeholders filled and the context dropped', () => {
  const t = new Translator();
  assert.equal(t.tr('{0} joined the {1}', 'Ann', 'party'), 'Ann joined the party');
  assert.equal(t.tr('Close|window'), 'Close');
  assert.equal(formatMessage('{0} and {3} {{x}}', ['a']), 'a and {3} {x}');
  assert.equal(sourceText('a|b|c'), 'a|b');
});

test('a catalog translates, contexts stay apart, and missing keys are reported once', () => {
  const missing: string[] = [];
  const t = new Translator({ onMissing: (k, l) => missing.push(`${l}:${k}`) });
  t.addCatalog('fr', { 'Close|window': 'Fermer', 'Close|near': 'Proche', 'Hello {0}': 'Bonjour {0}' });
  t.setLanguage('fr');
  assert.equal(t.tr('Close|window'), 'Fermer');
  assert.equal(t.tr('Close|near'), 'Proche');
  assert.equal(t.tr('Hello {0}', 'Lea'), 'Bonjour Lea');
  assert.equal(t.tr('Not there'), 'Not there');
  t.tr('Not there');
  assert.deepEqual(missing, ['fr:Not there']);
  assert.ok(t.has('Close|near'));
  assert.deepEqual(t.languages, ['en', 'fr']);
});

test('plurals follow the language’s own categories', () => {
  const t = new Translator();
  const { trn } = t;
  assert.equal(trn('{0} coin', '{0} coins', 1), '1 coin');
  assert.equal(trn('{0} coin', '{0} coins', 3), '3 coins');
  t.addCatalog('pl', { '{0} coins': { one: '{0} moneta', few: '{0} monety', many: '{0} monet', other: '{0} monety' } });
  t.setLanguage('pl');
  assert.equal(trn('{0} coin', '{0} coins', 1), '1 moneta');
  assert.equal(trn('{0} coin', '{0} coins', 3), '3 monety');
  assert.equal(trn('{0} coin', '{0} coins', 5), '5 monet');
});

test('switching language tells subscribers until they leave', () => {
  const t = new Translator();
  const heard: string[] = [];
  const off = t.subscribe((l) => heard.push(l));
  t.setLanguage('de');
  t.setLanguage('de');
  t.addCatalog('de', { Yes: 'Ja' });
  off();
  t.setLanguage('en');
  assert.deepEqual(heard, ['de', 'de']);
});
