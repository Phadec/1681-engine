import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LobbyRooms } from './LobbyRooms.ts';

const opts = (o: Partial<{ name: string; private: boolean; maxPlayers: number }> = {}) => ({ name: 'r', mode: 'duel', maxPlayers: 4, private: false, settings: null, ...o });

/** A seeded generator, so the codes are the same every run. */
function seeded(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

test('a room has a six-letter code without look-alike letters, found in any case', () => {
  const rooms = new LobbyRooms(seeded(7));
  const r = rooms.create(1, opts());
  assert.match(r.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(rooms.byInvite(r.code.toLowerCase()), r);
  assert.equal(rooms.get(r.id), r);
  assert.equal(rooms.of(1), r);
});

test('codes never repeat even when the random source does', () => {
  let calls = 0;
  // the first two codes drawn are the same; the second room must draw again
  const rooms = new LobbyRooms(() => (calls++ < 12 ? 0 : 0.5));
  const a = rooms.create(1, opts());
  const b = rooms.create(2, opts());
  assert.notEqual(a.code, b.code);
});

test('one room a player', () => {
  const rooms = new LobbyRooms();
  const r = rooms.create(1, opts());
  assert.throws(() => rooms.create(1, opts()), /already/);
  rooms.join(2, r);
  assert.throws(() => rooms.join(2, r), /already/);
});

test('the host passes to the next member and is not waiting on itself; the last out closes the room', () => {
  const rooms = new LobbyRooms();
  const r = rooms.create(1, opts());
  rooms.join(2, r);
  rooms.join(3, r);
  r.ready.add(2);
  assert.equal(rooms.allReady(r), false);
  r.ready.add(3);
  assert.equal(rooms.allReady(r), true);
  assert.deepEqual(rooms.leave(1), { room: r, closed: false });
  assert.equal(r.host, 2);
  assert.equal(r.ready.has(2), false);
  rooms.leave(2);
  assert.deepEqual(rooms.leave(3), { room: r, closed: true });
  assert.equal(rooms.count, 0);
  assert.equal(rooms.byInvite(r.code), undefined);
  assert.equal(rooms.leave(3), null);
});

test('only public, open rooms with room are listed, fullest first', () => {
  const rooms = new LobbyRooms();
  const small = rooms.create(1, opts({ name: 'small' }));
  const big = rooms.create(2, opts({ name: 'big' }));
  rooms.join(3, big);
  rooms.create(4, opts({ private: true }));
  const full = rooms.create(5, opts({ maxPlayers: 1 }));
  const busy = rooms.create(6, opts());
  busy.playing = true;
  assert.deepEqual(rooms.listed(10).map((r) => r.id), [big.id, small.id]);
  assert.deepEqual(rooms.listed(1).map((r) => r.id), [big.id]);
  assert.equal(rooms.summary(full).players, 1);
  assert.equal(rooms.summary(busy).busy, true);
});

test('a room\'s state names everyone, the host counted ready', () => {
  const rooms = new LobbyRooms();
  const r = rooms.create(1, opts());
  rooms.join(2, r);
  const s = rooms.state(r, (id) => ({ name: `p${id}` }));
  assert.deepEqual(s.members, [
    { id: 1, data: { name: 'p1' }, ready: true },
    { id: 2, data: { name: 'p2' }, ready: false },
  ]);
  assert.equal(s.code, r.code);
});
