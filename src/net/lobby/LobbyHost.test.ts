import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventBus } from '../../events/EventBus.ts';
import { LobbyClient, type LobbyLink } from './LobbyClient.ts';
import { LobbyHost, type LobbyHostOptions } from './LobbyHost.ts';

interface Info {
  name: string;
}

/** A host on a hand-moved clock, with clients wired straight to it (no sockets). */
function setup(options: Partial<LobbyHostOptions<Info>> = {}) {
  let now = 1_000;
  const host = new LobbyHost<Info>({
    modes: [{ id: 'duel', teams: 2, teamSize: 1 }, { id: '2v2', teams: 2, teamSize: 2 }],
    admit: (d) => ({ name: String((d as { name?: unknown })?.name ?? '?') }),
    now: () => now,
    random: (() => {
      let s = 1;
      return () => ((s = (s * 16807) % 2147483647) / 2147483647);
    })(),
    ...options,
  });
  const closed: number[] = [];
  const client = (name: string) => {
    const events = new EventBus<{ message: { t: string; [k: string]: unknown } }>();
    let id = -1;
    const link: LobbyLink = { send: (msg) => host.message(id, JSON.stringify(msg)), events };
    id = host.connect({ send: (data) => events.emit('message', JSON.parse(data as string)), close: () => closed.push(id) });
    const lobby = new LobbyClient(link);
    host.message(id, JSON.stringify({ t: 'hello', data: { name } }));
    return lobby;
  };
  return { host, client, closed, tick: (ms: number) => ((now += ms), host.update(now)) };
}

test('a hello is welcomed with an id, the modes and the room list', () => {
  const { client } = setup();
  const a = client('Ash');
  assert.ok(a.id > 0);
  assert.deepEqual(a.modes, ['duel', '2v2']);
  assert.deepEqual(a.rooms, []);
});

test('rooms: create, list, join, ready, chat, the host leaves and the next one hosts', () => {
  const { client, tick } = setup();
  const a = client('Ash');
  const b = client('Bryn');
  const c = client('Cael');
  a.create({ name: 'Ash’s room', mode: '2v2', maxPlayers: 3 });
  assert.equal(a.room?.host, a.id);
  tick(1000);
  assert.equal(b.rooms.length, 1, 'browsers see it');
  b.join(b.rooms[0]!.id);
  const chats: string[] = [];
  a.events.on('chat', ({ text }) => chats.push(text));
  b.chat('  hello  ');
  assert.deepEqual(chats, ['hello']);
  assert.equal(a.room?.members.length, 2);
  b.setReady(true);
  assert.ok(a.roomReady);
  a.leave();
  assert.equal(a.room, null);
  assert.equal(b.room?.host, b.id, 'the host passed to the next member');
  c.join(b.room!.id);
  assert.equal(b.room?.members.length, 2);
});

test('a private room is found only by its code, and a full or busy one refuses', () => {
  const { client, tick } = setup();
  const a = client('Ash');
  a.create({ private: true, maxPlayers: 2 });
  tick(1000);
  const b = client('Bryn');
  assert.equal(b.rooms.length, 0, 'not listed');
  const errors: string[] = [];
  b.events.on('error', (e) => errors.push(e.code));
  b.join(a.room!.id);
  assert.deepEqual(errors, ['no-room']);
  b.joinByCode(a.room!.code.toLowerCase());
  assert.equal(b.room?.id, a.room?.id);
  const c = client('Cael');
  c.events.on('error', (e) => errors.push(e.code));
  c.joinByCode(a.room!.code);
  assert.deepEqual(errors, ['no-room', 'room-full']);
});

test('two singles queue, find a duel, both accept, and onStart tells each where to go', () => {
  const started: string[] = [];
  const { client, tick } = setup({ onStart: (m) => {
      started.push(m.id);
      return (id: number) => ({ server: 'game-1', you: id, match: m.id });
    },
  });
  const a = client('Ash');
  const b = client('Bryn');
  a.queue('duel');
  assert.equal(a.queued?.mode, 'duel');
  b.queue('duel');
  tick(1000);
  assert.ok(a.match && b.match, 'both were offered the match');
  assert.deepEqual(a.match.players.map((p) => p.team).sort(), [0, 1]);
  const go: unknown[] = [];
  a.events.on('start', (s) => go.push(s.data));
  b.events.on('start', (s) => go.push(s.data));
  a.accept();
  assert.equal(b.match?.accepted.length, 1);
  b.accept();
  assert.equal(started.length, 1);
  assert.deepEqual(go, [{ server: 'game-1', you: a.id, match: started[0] }, { server: 'game-1', you: b.id, match: started[0] }]);
  assert.equal(a.match, null);
});

test('a decline locks the decliner out and puts the other back at its old place', () => {
  const { client, tick, host } = setup({ declineLockMs: 30_000 });
  const a = client('Ash');
  const b = client('Bryn');
  a.queue('duel');
  tick(500);
  b.queue('duel');
  tick(500);
  const since = host.matchmaker.waiting('duel').length;
  assert.equal(since, 0);
  b.decline();
  assert.equal(a.match, null);
  assert.ok(a.queued, 'Ash is queued again');
  assert.equal(a.queued?.since, 1_000, 'at the old place');
  assert.equal(b.queued, null);
  assert.ok(b.lockedUntil > 0);
  const errors: string[] = [];
  b.events.on('error', (e) => errors.push(e.code));
  b.queue('duel');
  assert.deepEqual(errors, ['locked']);
  tick(31_000);
  b.queue('duel');
  tick(1000);
  assert.ok(a.match && b.match, 'after the lock they meet again');
});

test('a ready check that lapses blames only who did not answer', () => {
  const { client, tick } = setup({ readyCheckMs: 10_000 });
  const a = client('Ash');
  const b = client('Bryn');
  a.queue('duel');
  b.queue('duel');
  tick(1000);
  a.accept();
  tick(11_000);
  assert.equal(a.match, null);
  assert.ok(a.queued, 'the one who accepted is requeued');
  assert.equal(b.queued, null);
  assert.ok(b.lockedUntil > 0);
});

test('a room queues whole as a party and is matched against two singles', () => {
  const { client, tick } = setup({ readyCheckMs: 0, onStart: () => 'go' });
  const a = client('Ash');
  const b = client('Bryn');
  a.create({ mode: '2v2' });
  b.join(a.room!.id);
  const errors: string[] = [];
  a.events.on('error', (e) => errors.push(e.code));
  b.events.on('error', (e) => errors.push(e.code));
  a.queue('2v2');
  assert.deepEqual(errors, ['not-ready']);
  b.queue('2v2');
  assert.deepEqual(errors, ['not-ready', 'not-host']);
  b.setReady(true);
  a.queue('2v2');
  assert.ok(a.room?.queued && b.queued);
  const c = client('Cael');
  const d = client('Dara');
  c.queue('2v2');
  d.queue('2v2');
  const starts: number[][] = [];
  a.events.on('start', (s) => starts.push(s.players.filter((p) => p.team === s.players.find((q) => q.id === a.id)!.team).map((p) => p.id)));
  tick(1000);
  assert.deepEqual(starts[0]?.sort(), [a.id, b.id].sort(), 'the party is one team');
  assert.ok(a.room?.busy, 'the room is playing until the game says it is finished');
});

test('leaving mid-check cancels it; disconnecting leaves room and queue', () => {
  const { client, tick, host } = setup();
  const a = client('Ash');
  const b = client('Bryn');
  a.queue('duel');
  b.queue('duel');
  tick(1000);
  const cancelled: string[] = [];
  a.events.on('cancelled', (c) => cancelled.push(c.reason));
  host.disconnect(b.id);
  assert.deepEqual(cancelled, ['left']);
  assert.ok(a.queued);
  const c = client('Cael');
  c.create({});
  host.disconnect(c.id);
  tick(1000);
  assert.equal(host.rooms.count, 0, 'an empty room closes');
});

test('the host kicks and promotes; a room start needs everyone ready', () => {
  const starts: string[] = [];
  const { client } = setup({
    onStart: (m) => {
      starts.push(`${m.room}:${m.players.length}`);
      return null;
    },
  });
  const a = client('Ash');
  const b = client('Bryn');
  const c = client('Cael');
  a.create({ settings: { map: 'harbour' } });
  b.join(a.room!.id);
  c.join(a.room!.id);
  let kicked = false;
  c.events.on('kicked', () => (kicked = true));
  a.kick(c.id);
  assert.ok(kicked && c.room === null);
  const errors: string[] = [];
  a.events.on('error', (e) => errors.push(e.code));
  a.startRoom();
  assert.deepEqual(errors, ['not-ready']);
  b.setReady(true);
  a.startRoom();
  assert.deepEqual(starts, [`${a.room!.id}:2`]);
  a.promote(b.id);
  assert.equal(b.room?.host, b.id);
});

test('nonsense is ignored and a flood is refused, then closed', () => {
  const { client, host, closed } = setup({ ratePerSecond: 5 });
  const a = client('Ash');
  host.message(a.id, 'not json');
  host.message(a.id, JSON.stringify({ t: 'lobby/join' }));
  host.message(a.id, JSON.stringify({ t: 'queue/join', mode: 42 }));
  const errors: string[] = [];
  a.events.on('error', (e) => errors.push(e.code));
  for (let i = 0; i < 20; i++) a.list();
  assert.ok(errors.includes('rate'));
  assert.deepEqual(closed, [a.id]);
});

test('a Connection is a LobbyLink', async () => {
  const { Connection } = await import('../Connection.ts');
  const link: LobbyLink = new Connection('ws://127.0.0.1:1', { reconnect: false });
  assert.ok(link);
});
