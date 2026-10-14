import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MovementParams } from './constants.ts';
import { InterpolationBuffer } from './InterpolationBuffer.ts';
import { LagCompensator } from './LagCompensator.ts';
import { createCollisionGrid } from './movement.ts';
import type { Snapshot } from './protocol.ts';
import { BODY_ID_BASE, Room } from './Room.ts';
import { RoomHost } from './RoomHost.ts';
import { decodeSnapshotFrame } from './snapshotCodec.ts';
import { SpatialHash } from './SpatialHash.ts';

const params: MovementParams = { speed: 60, dashSpeed: 180, dashSteps: 6, dashCooldownSteps: 30, canMove: true, canDash: true };
/** A 64 × 64 tile field, all open, walled round. */
const W = 64;
const solid = Array.from({ length: W * W }, (_, i) => (i % W === 0 || i % W === W - 1 || i < W || i >= W * (W - 1) ? '1' : '0')).join('');
const grid = createCollisionGrid(W, W, 16, solid);

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('the hash finds exactly the points a brute-force search finds, through moves and deletes', () => {
  const r = rng(7);
  const h = new SpatialHash(50);
  const pts = new Map<number, [number, number]>();
  for (let round = 0; round < 30; round++) {
    for (let k = 0; k < 20; k++) {
      const id = Math.floor(r() * 60);
      if (r() < 0.15) {
        h.delete(id);
        pts.delete(id);
      } else {
        const p: [number, number] = [r() * 1000 - 500, r() * 1000 - 500];
        h.set(id, p[0], p[1]);
        pts.set(id, p);
      }
    }
    assert.equal(h.size, pts.size);
    const x = r() * 1000 - 500;
    const y = r() * 1000 - 500;
    const radius = r() * 300;
    const want = [...pts].filter(([, [px, py]]) => (px - x) ** 2 + (py - y) ** 2 <= radius * radius).map(([id]) => id).sort((a, b) => a - b);
    assert.deepEqual(h.near(x, y, radius).sort((a, b) => a - b), want, `round ${round}`);
    const box = [...pts].filter(([, [px, py]]) => px >= x && px <= x + radius && py >= y && py <= y + radius / 2).map(([id]) => id).sort((a, b) => a - b);
    assert.deepEqual(h.inRect(x, y, x + radius, y + radius / 2).sort((a, b) => a - b), box);
  }
  // a query far wider than the world still answers right (it walks the points, not the cells)
  assert.equal(h.near(0, 0, 1e7).length, h.size);
  h.clear();
  assert.equal(h.size, 0);
  assert.deepEqual(h.near(0, 0, 1e7), []);
  assert.throws(() => new SpatialHash(0));
});

test('a point on a cell edge or the query edge counts, and negative coordinates sort into their own cells', () => {
  const h = new SpatialHash(10);
  h.set(1, 10, 0);
  h.set(2, -0.5, -0.5);
  h.set(3, -10, -10);
  assert.deepEqual(h.near(0, 0, 10).sort(), [1, 2]);
  assert.deepEqual(h.near(-10, -10, 0), [3]);
  assert.ok(h.has(2));
  h.set(2, 500, 500);
  assert.deepEqual(h.near(0, 0, 10), [1]);
});

/** A room of players at fixed places, made to step once so they are filed in the interest grid. */
function roomWith(places: [number, number][], interest?: ConstructorParameters<typeof Room>[0]['interest']) {
  const room = new Room<{ team: number }>({
    grid,
    params,
    spawn: (id) => ({ x: places[id - 1]![0], y: places[id - 1]![1] }),
    interest: interest as never,
  });
  places.forEach((_, i) => room.join(i + 1, { team: i % 2 }));
  return room;
}

const ids = (s: Snapshot | null) => (s?.up ?? []).map((u) => u[0]);

test('with interest a player is sent itself and the bodies in range, spawned once, and removed past the margin', () => {
  const room = roomWith(
    [
      [100, 100],
      [150, 100],
      [400, 100],
    ],
    { radius: 100, leaveMargin: 40 },
  );
  let s = room.snapshotFor(1, 0)!;
  assert.deepEqual(ids(s), [1, 2]);
  assert.deepEqual(s.sp!.map((x) => x.id), [1, 2]);
  // 2 walks out to 230: past the 100 radius but inside the 140 margin, so it stays
  room.place(2, 230, 100);
  s = room.snapshotFor(1, 1)!;
  assert.deepEqual(ids(s), [1, 2]);
  assert.equal(s.sp, undefined);
  assert.equal(s.rm, undefined);
  room.place(2, 245, 100);
  s = room.snapshotFor(1, 2)!;
  assert.deepEqual(ids(s), [1]);
  assert.deepEqual(s.rm, [2]);
  // back at 230 it is not in again: a body comes in only within the radius itself
  room.place(2, 230, 100);
  assert.deepEqual(ids(room.snapshotFor(1, 3)), [1]);
  room.place(2, 199, 100);
  s = room.snapshotFor(1, 4)!;
  assert.deepEqual(ids(s), [1, 2]);
  assert.deepEqual(s.sp!.map((x) => x.id), [2]);
  // 3 far away sees only itself
  assert.deepEqual(ids(room.snapshotFor(3, 5)), [3]);
});

test('canSee narrows what distance lets through, and the default margin is a quarter of the radius', () => {
  const room = roomWith(
    [
      [100, 100],
      [120, 100],
      [140, 100],
      [222, 100],
    ],
    { radius: 100, canSee: (_viewer, other) => other.id !== 3 },
  );
  // 3 is in range but hidden; 4 is 122 px away, outside the radius
  assert.deepEqual(ids(room.snapshotFor(1, 0)), [1, 2]);
  room.place(4, 201, 100);
  assert.deepEqual(ids(room.snapshotFor(1, 1)), [1, 2]);
  room.place(4, 195, 100);
  assert.deepEqual(ids(room.snapshotFor(1, 2)), [1, 2, 4]);
  // kept to 100 + 25
  room.place(4, 224, 100);
  assert.deepEqual(ids(room.snapshotFor(1, 3)), [1, 2, 4]);
  room.place(4, 226, 100);
  assert.deepEqual(ids(room.snapshotFor(1, 4)), [1, 2]);
});

test('bodies walked by their own input are found where they walked to', () => {
  const room = roomWith(
    [
      [100, 100],
      [300, 100],
    ],
    { radius: 175 },
  );
  assert.deepEqual(ids(room.snapshotFor(1, 0)), [1]);
  // 2 walks left half a second: 30 px at speed 60, to 170 px from 1
  room.input(2, 0, Array.from({ length: 30 }, () => [-1, 0, 0] as [number, number, number]));
  for (let i = 0; i < 60; i++) room.step();
  const two = room.players.get(2)!.mover;
  assert.equal(two.x, 270);
  assert.deepEqual(ids(room.snapshotFor(1, 1)), [1, 2]);
  // a teleport written straight into the mover is seen after the next step
  two.x = 900;
  room.step();
  assert.deepEqual(ids(room.snapshotFor(1, 2)), [1]);
});

test('without interest every body goes to every player, as before', () => {
  const room = roomWith([
    [100, 100],
    [900, 900],
  ]);
  assert.deepEqual(ids(room.snapshotFor(1, 0)), [1, 2]);
  assert.throws(() => roomWith([[0, 0]], { radius: 0 }));
});

test('a player who leaves is removed from the others and from the grid', () => {
  const room = roomWith(
    [
      [100, 100],
      [110, 100],
    ],
    { radius: 50 },
  );
  room.snapshotFor(1, 0);
  room.leave(2);
  const s = room.snapshotFor(1, 1)!;
  assert.deepEqual(s.rm, [2]);
  assert.deepEqual(ids(s), [1]);
});

test('the history blends between frames like the client buffer, and holds before the first and after the last', () => {
  const lag = new LagCompensator(1000);
  assert.equal(lag.at(1, 0), null);
  assert.deepEqual(lag.all(0), []);
  lag.record(100, [{ id: 1, x: 0, y: 0 }]);
  lag.record(200, [
    { id: 1, x: 10, y: 20 },
    { id: 2, x: 50, y: 50 },
  ]);
  lag.record(300, [{ id: 1, x: 30, y: 20 }]);
  assert.deepEqual(lag.at(1, 150), { x: 5, y: 10 });
  assert.deepEqual(lag.at(1, 250), { x: 20, y: 20 });
  assert.deepEqual(lag.at(1, 50), { x: 0, y: 0 });
  assert.deepEqual(lag.at(1, 999), { x: 30, y: 20 });
  // 2 appeared at 200 and was gone by 300: held where the one frame that has it put it, as the client draws it
  assert.deepEqual(lag.at(2, 150), { x: 50, y: 50 });
  assert.deepEqual(lag.at(2, 250), { x: 50, y: 50 });
  assert.equal(lag.at(2, 300), null);
  assert.equal(lag.at(3, 150), null);
  assert.deepEqual([lag.oldest, lag.newest], [100, 300]);
  // a time recorded again replaces its frame
  lag.record(300, [{ id: 1, x: 40, y: 20 }]);
  assert.deepEqual(lag.at(1, 300), { x: 40, y: 20 });
  lag.forget(1);
  assert.equal(lag.at(1, 150), null);
});

test('the history keeps only its window, with one frame at or before its edge', () => {
  const lag = new LagCompensator(100);
  for (let t = 0; t <= 1000; t += 50) lag.record(t, [{ id: 1, x: t, y: 0 }]);
  assert.equal(lag.newest, 1000);
  assert.ok(lag.oldest <= 900 && lag.oldest >= 850, `oldest ${lag.oldest}`);
  assert.deepEqual(lag.at(1, 900), { x: 900, y: 0 });
  lag.clear();
  assert.equal(lag.newest, -Infinity);
});

test('a claimed time is honoured only within the rewind window', () => {
  assert.equal(LagCompensator.clampTime(950, 1000, 200), 950);
  assert.equal(LagCompensator.clampTime(100, 1000, 200), 800);
  assert.equal(LagCompensator.clampTime(5000, 1000, 200), 1000, 'no shots from the future');
  assert.equal(LagCompensator.clampTime('950', 1000, 200), 1000);
  assert.equal(LagCompensator.clampTime(Number.NaN, 1000, 200), 1000);
  assert.equal(LagCompensator.clampTime(Infinity, 1000, 200), 1000);
});

test('near and alongRay judge against the rewound picture, nearest first, leaving the shooter out', () => {
  const lag = new LagCompensator();
  lag.record(0, [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 100, y: 0 },
    { id: 3, x: 50, y: 4 },
    { id: 4, x: -30, y: 0 },
  ]);
  lag.record(100, [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 100, y: 100 },
    { id: 3, x: 50, y: 4 },
    { id: 4, x: -30, y: 0 },
  ]);
  // at 0 a shot right from 1 meets 3 (4 px off the line, radius 6) and then 2; 4 is behind the shooter
  const then = lag.alongRay(0, 0, 0, 1, 0, 500, 6, 1);
  assert.deepEqual(then.map((h) => h.id), [3, 2]);
  assert.ok(Math.abs(then[0]!.along - (50 - Math.sqrt(36 - 16))) < 1e-9);
  // by 100, 2 has walked off the line
  assert.deepEqual(lag.alongRay(100, 0, 0, 1, 0, 500, 6, 1).map((h) => h.id), [3]);
  // half way, 2 is at (100, 50)
  assert.deepEqual(lag.alongRay(50, 0, 0, 1, 0.5, 500, 6, 1).map((h) => h.id), [2]);
  // out of range, and a ray of no length, hit nothing
  assert.deepEqual(lag.alongRay(0, 0, 0, 1, 0, 40, 6, 1), []);
  assert.deepEqual(lag.alongRay(0, 0, 0, 0, 0, 500, 6, 1), []);
  // a ray starting inside a body meets it at 0
  assert.equal(lag.alongRay(0, 98, 0, 1, 0, 500, 6)[0]!.along, 0);
  assert.deepEqual(lag.near(0, 0, 0, 60, 1).map((b) => b.id), [4, 3]);
  assert.deepEqual(lag.near(0, 0, 0, 60).map((b) => b.id), [1, 4, 3]);
});

test('through a real host, the server rewinds to the very spot the client drew a body at', () => {
  let now = 10_000;
  const room = new Room({ grid, params, spawn: (id) => ({ x: 200 + id * 50, y: 300 }), rewindMs: 250 });
  const host = new RoomHost(room, { now: () => now, stepRate: 60, snapRate: 20 });
  const frames: (string | Uint8Array)[] = [];
  const shooter = host.connect({ send: (d) => frames.push(d), close: () => undefined });
  const target = host.connect({ send: () => undefined, close: () => undefined });
  host.message(shooter, JSON.stringify({ t: 'hello' }));
  host.message(target, JSON.stringify({ t: 'hello' }));
  // the target runs right, then down, changing course mid-way
  host.message(target, JSON.stringify({ t: 'input', seq: 0, steps: Array.from({ length: 30 }, () => [1, 0, 0]) }));
  const buffer = new InterpolationBuffer(100);
  const targetId = 2;
  const stepMs = 1000 / 60;
  let ahead = 0;
  for (let i = 0; i < 90; i++) {
    if (i === 30) host.message(target, JSON.stringify({ t: 'input', seq: 30, steps: Array.from({ length: 30 }, () => [0, 1, 0]) }));
    now += stepMs;
    host.stepOnce();
    for (const f of frames.splice(0)) {
      const snap = typeof f === 'string' ? (JSON.parse(f) as Snapshot) : (decodeSnapshotFrame(f) as Snapshot);
      if (snap.t === 'snap') buffer.push(snap.time, snap.up ?? []);
    }
    if (i < 20) continue;
    // what the client draws now, and what the server finds at the time the client says it drew it
    const drawn = buffer.sample(targetId, now)!;
    const at = host.rewindTime(buffer.viewTime(now));
    const rewound = room.history!.at(targetId, at)!;
    // the same blend of the same frames: equal to the wire's 1/8 px
    assert.ok(Math.abs(drawn.x - rewound.x) <= 1 / 16 + 1e-9 && Math.abs(drawn.y - rewound.y) <= 1 / 16 + 1e-9, `step ${i}: drawn ${drawn.x},${drawn.y} rewound ${rewound.x},${rewound.y}`);
    const live = room.players.get(targetId)!.mover;
    ahead = Math.max(ahead, Math.hypot(live.x - drawn.x, live.y - drawn.y));
  }
  // while it ran, the target was well ahead of where it was drawn: without the rewind a shot at it would miss
  assert.ok(ahead > 6, `at most ${ahead} px ahead`);
  // a claim from long ago is held to the room's 250 ms
  assert.equal(host.rewindTime(0), now - 250);
  const plain = new RoomHost(new Room({ grid, params, spawn: () => ({ x: 100, y: 100 }) }), { now: () => now });
  assert.equal(plain.rewindTime(now - 100), now, 'no history: no rewind');
  assert.equal(plain.room.history, null);
});

test('bodies the server moves go out beside the players: spawned with their data, updated, removed', () => {
  const room = new Room<{ name: string }, { kind: string }>({ grid, params, spawn: () => ({ x: 100, y: 100 }) });
  room.join(100, { name: 'a' });
  const wolf = room.addBody({ kind: 'wolf' }, 140, 100);
  assert.equal(wolf.id, BODY_ID_BASE);
  wolf.hp = 7;
  let s = room.snapshotFor(100, 0)!;
  assert.deepEqual(ids(s), [100, wolf.id]);
  assert.deepEqual(s.sp!.find((x) => x.id === wolf.id)!.data, { kind: 'wolf' });
  assert.deepEqual(s.up!.find((u) => u[0] === wolf.id), [wolf.id, 140, 100, 0, 0, 7, 0]);
  wolf.x = 150;
  s = room.snapshotFor(100, 1)!;
  assert.equal(s.sp, undefined);
  assert.equal(s.up!.find((u) => u[0] === wolf.id)![1], 150);
  room.removeBody(wolf.id);
  s = room.snapshotFor(100, 2)!;
  assert.deepEqual(s.rm, [wolf.id]);
  assert.deepEqual(ids(s), [100]);
  // the codec carries a body id above 2^24 whole
  const host = new RoomHost(room, { now: () => 0 });
  const frames: (string | Uint8Array)[] = [];
  const sock = host.connect({ send: (d) => frames.push(d), close: () => undefined });
  host.message(sock, JSON.stringify({ t: 'hello', data: { name: 'b' } }));
  const big = room.addBody({ kind: 'crow' }, 120, 90);
  host.sendTo(sock, room.snapshotFor(sock, 5)!);
  const decoded = decodeSnapshotFrame(frames.at(-1) as Uint8Array) as Snapshot;
  assert.ok(decoded.up!.some((u) => u[0] === big.id));
});

test('ids are kept apart: a player cannot take a body id, nor a body a player one', () => {
  const room = new Room({ grid, params, spawn: () => ({ x: 0, y: 0 }) });
  room.join(5, {});
  assert.throws(() => room.addBody({}, 0, 0, 5), /taken/);
  const b = room.addBody({}, 0, 0, 77);
  assert.throws(() => room.join(77, {}), /body's/);
  assert.throws(() => room.addBody({}, 0, 0, 2 ** 31), /i32/);
  assert.equal(room.addBody({}, 0, 0).id, BODY_ID_BASE);
  assert.equal(b.id, 77);
  room.removeBody(999); // nothing
});

test('bodies are under interest too, by distance and by canSee, and moved by place or by hand', () => {
  const room = new Room<unknown, { hidden: boolean }>({
    grid,
    params,
    spawn: () => ({ x: 100, y: 100 }),
    interest: { radius: 100, canSee: (_me, other) => other.kind === 'player' || !other.data.hidden },
  });
  room.join(1, {});
  const near = room.addBody({ hidden: false }, 150, 100);
  const far = room.addBody({ hidden: false }, 400, 100);
  const sneaky = room.addBody({ hidden: true }, 120, 100);
  assert.deepEqual(ids(room.snapshotFor(1, 0)), [1, near.id]);
  room.place(far.id, 180, 100);
  assert.deepEqual(ids(room.snapshotFor(1, 1)), [1, near.id, far.id]);
  near.x = 900; // by hand: found there after the next step
  room.step();
  assert.deepEqual(ids(room.snapshotFor(1, 2)), [1, far.id]);
  sneaky.data.hidden = false;
  assert.deepEqual(ids(room.snapshotFor(1, 3)), [1, far.id, sneaky.id]);
});

test('the rewind history holds the bodies, so a shot at a monster is judged where it was seen', () => {
  const room = new Room({ grid, params, spawn: () => ({ x: 100, y: 100 }), rewindMs: 200 });
  room.join(1, {});
  const imp = room.addBody({}, 200, 100);
  room.record(1000);
  imp.x = 260;
  room.record(1100);
  assert.deepEqual(room.history!.at(imp.id, 1050), { x: 230, y: 100 });
  assert.deepEqual(room.history!.alongRay(1000, 100, 100, 1, 0, 300, 6, 1).map((h) => h.id), [imp.id]);
  room.removeBody(imp.id);
  assert.equal(room.history!.at(imp.id, 1050), null);
});
