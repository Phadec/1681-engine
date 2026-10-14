import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LobbyRooms } from './LobbyRooms.ts';

const opts = { name: 'Room', mode: 'duel', maxPlayers: 3, private: false, settings: null };

function seeded(): () => number {
  let s = 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

test('a room gets an id and a six-letter code found in any case', () => {
  const rooms = new LobbyRooms(seeded());
  const r = rooms.create(1, opts);
  assert.equal(r.id, 'R1');
  assert.match(r.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(rooms.byInvite(r.code.toLowerCase()), r);
  assert.equal(rooms.of(1), r);
  assert.throws(() => rooms.create(1, opts), /already/);
});

test('the host passes to the first member left; an empty room closes', () => {
  const rooms = new LobbyRooms(seeded());
  const r = rooms.create(1, opts);
  rooms.join(2, r);
  rooms.join(3, r);
  r.ready.add(2);
  assert.throws(() => rooms.join(2, r), /already/);
  assert.deepEqual(rooms.leave(1), { room: r, closed: false });
  assert.equal(r.host, 2);
  assert.equal(r.ready.has(2), false, 'a new host is not waiting on itself');
  rooms.leave(2);
  assert.deepEqual(rooms.leave(3), { room: r, closed: true });
  assert.equal(rooms.count, 0);
  assert.equal(rooms.byInvite(r.code), undefined);
  assert.equal(rooms.leave(3), null);
});

test('everyone but the host must be ready', () => {
  const rooms = new LobbyRooms(seeded());
  const r = rooms.create(1, opts);
  assert.equal(rooms.allReady(r), true);
  rooms.join(2, r);
  assert.equal(rooms.allReady(r), false);
  r.ready.add(2);
  assert.equal(rooms.allReady(r), true);
  assert.deepEqual(
    rooms.state(r, (id) => `p${id}`).members,
    [
      { id: 1, data: 'p1', ready: true },
      { id: 2, data: 'p2', ready: true },
    ],
  );
});

test('the browse list holds open public rooms with room, fullest first', () => {
  const rooms = new LobbyRooms(seeded());
  const a = rooms.create(1, opts);
  const b = rooms.create(2, opts);
  rooms.join(3, b);
  rooms.create(4, { ...opts, private: true });
  const full = rooms.create(5, opts);
  rooms.join(6, full);
  rooms.join(7, full);
  const busy = rooms.create(8, opts);
  busy.playing = true;
  assert.deepEqual(
    rooms.listed(10).map((s) => s.id),
    [b.id, a.id],
  );
  assert.equal(rooms.listed(1).length, 1);
  assert.equal(rooms.summary(busy).busy, true);
});
