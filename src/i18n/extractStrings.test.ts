import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractStrings } from './extractStrings.ts';

test('finds keys in every quote style, with lines, contexts and plurals', () => {
  const src = [
    "const a = tr('Open the gate');",
    'label(i18n.tr("Close|window"), x);',
    'const b = tr(`It\\u2019s {0}`, n);',
    "const c = trn('{0} coin', '{0} coins', n);",
    'const d = tr(`${dynamic}`); const e = tr(key); const f = attr("no");',
    "const g = tr( 'Line \\",
    "two' );",
  ].join('\n');
  assert.deepEqual(extractStrings(src), [
    { key: 'Open the gate', fn: 'tr', line: 1 },
    { key: 'Close|window', fn: 'tr', line: 2 },
    { key: 'It’s {0}', fn: 'tr', line: 3 },
    { key: '{0} coins', one: '{0} coin', fn: 'trn', line: 4 },
    { key: 'Line two', fn: 'tr', line: 6 },
  ]);
});

test('other function names can be given', () => {
  assert.deepEqual(extractStrings("t('x'); tr('y');", { single: ['t'], plural: [] }), [{ key: 'x', fn: 't', line: 1 }]);
});
