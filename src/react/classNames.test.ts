import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classJoiner } from './classNames.ts';

test('the joiner keeps every name and adds the mapped ones after it', () => {
  const cx = classJoiner({ button: 'btn', picked: 'active' });
  assert.equal(cx('e1681-button small', 'picked'), 'e1681-button btn small picked active');
  assert.equal(cx('e1681-row', false, undefined, '', 'x'), 'e1681-row x');
  assert.equal(classJoiner({})('e1681-tabs  wrap'), 'e1681-tabs wrap');
});
