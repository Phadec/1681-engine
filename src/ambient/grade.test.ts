import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gradeAt, mixToWhite } from './grade';

test('a grade deepens from its day strength to its night strength, capped', () => {
  const g = { color: 0x336699, day: 0.04, night: 0.1 };
  assert.deepEqual(gradeAt(g, 0), { color: 0x336699, alpha: 0.04 });
  assert.equal(gradeAt(g, 1).alpha, 0.1);
  assert.ok(Math.abs(gradeAt(g, 0.5).alpha - 0.07) < 1e-12);
  assert.equal(gradeAt(g, 7).alpha, 0.1);
  assert.equal(gradeAt({ color: 0, day: 0.5, night: 0.9 }, 1).alpha, 0.14);
  assert.equal(gradeAt({ color: 0, day: 0.5, night: 0.9 }, 1, 1).alpha, 0.9);
});

test('a multiply colour mixed toward white', () => {
  assert.equal(mixToWhite(0x000000, 0), 0xffffff);
  assert.equal(mixToWhite(0x000000, 1), 0x000000);
  assert.equal(mixToWhite(0x804020, 1), 0x804020);
  assert.equal(mixToWhite(0x000000, 0.5), 0x808080);
});
