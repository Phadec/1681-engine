import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Matchmaker, balanceTeams, type Ticket } from './Matchmaker.ts';

const t = (id: string, members: number[], rating: number, since = 0, mode = 'duo'): Ticket => ({ id, mode, members, rating, since });

test('two singles of a similar rating make a duel at once; a far one waits', () => {
  const mm = new Matchmaker([{ id: 'duel', teams: 2, teamSize: 1 }]);
  mm.add(t('a', [1], 1000, 0, 'duel'));
  mm.add(t('b', [2], 1050, 0, 'duel'));
  mm.add(t('c', [3], 1600, 0, 'duel'));
  const found = mm.find(0);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0]!.teams.flat().sort(), [1, 2]);
  assert.equal(mm.size, 1);
});

test('the window widens with the wait until even a far pair is matched', () => {
  const mm = new Matchmaker([{ id: 'duel', teams: 2, teamSize: 1, window: 100, widenPerSecond: 20, maxWindow: 1000 }]);
  mm.add(t('a', [1], 1000, 0, 'duel'));
  mm.add(t('b', [2], 1400, 0, 'duel'));
  assert.equal(mm.find(5_000).length, 0); // 100 + 100 = 200
  assert.equal(mm.find(15_000).length, 1); // 100 + 300 = 400
});

test('a newcomer is not thrown in with a veteran just because the veteran waited: both windows must allow it', () => {
  const mm = new Matchmaker([{ id: 'duel', teams: 2, teamSize: 1, window: 100, widenPerSecond: 20, maxWindow: 1000 }]);
  mm.add(t('old', [1], 1000, 0, 'duel'));
  mm.add(t('new', [2], 1400, 19_000, 'duel'));
  assert.equal(mm.find(20_000).length, 0); // the veteran reaches 500, the newcomer only 120
});

test('parties are never split, and a party of three fits beside a single in a 2×2', () => {
  const mm = new Matchmaker([{ id: '2v2', teams: 2, teamSize: 2 }]);
  mm.add(t('p', [1, 2], 1000, 0, '2v2'));
  mm.add(t('s1', [3], 1010, 1, '2v2'));
  mm.add(t('s2', [4], 990, 2, '2v2'));
  const [m] = mm.find(10);
  assert.ok(m);
  const team = m.teams.find((x) => x.includes(1))!;
  assert.ok(team.includes(2), 'the party stays together');
  assert.deepEqual(m.teams.map((x) => x.length), [2, 2]);
  assert.throws(() => mm.add(t('big', [5, 6, 7], 1000, 0, '2v2')), /does not fit/);
});

test('it looks past a closer single that would leave no room for the party', () => {
  // 3v3: a party of three and three singles; the closest singles first would overfill, the search finds the fit
  const mm = new Matchmaker([{ id: '3v3', teams: 2, teamSize: 3 }]);
  mm.add(t('anchor', [1, 2], 1000, 0, '3v3'));
  mm.add(t('trio', [3, 4, 5], 1100, 1, '3v3'));
  mm.add(t('x', [6], 1001, 2, '3v3'));
  const [m] = mm.find(10);
  assert.ok(m);
  assert.deepEqual(m.teams.flat().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  assert.ok(m.teams.some((x) => x.includes(3) && x.includes(4) && x.includes(5)));
});

test('balanceTeams evens the ratings out', () => {
  const groups = [t('a', [1], 1400), t('b', [2], 1000), t('c', [3], 1300), t('d', [4], 1100)];
  const teams = balanceTeams(groups, 2, 2)!;
  const sum = (ids: number[]) => ids.reduce((s, id) => s + groups.find((g) => g.members[0] === id)!.rating, 0);
  assert.equal(Math.abs(sum(teams[0]!) - sum(teams[1]!)), 0);
  assert.equal(balanceTeams([t('p', [1, 2, 3], 1000)], 2, 2), null);
});

test('matches are made per mode, several in one call', () => {
  const mm = new Matchmaker([{ id: 'duel', teams: 2, teamSize: 1 }, { id: 'ffa', teams: 4, teamSize: 1 }]);
  for (let i = 0; i < 4; i++) mm.add(t(`d${i}`, [i], 1000, i, 'duel'));
  for (let i = 10; i < 14; i++) mm.add(t(`f${i}`, [i], 1000, i, 'ffa'));
  const found = mm.find(100);
  assert.equal(found.filter((f) => f.mode === 'duel').length, 2);
  assert.equal(found.filter((f) => f.mode === 'ffa').length, 1);
  assert.equal(mm.size, 0);
});
