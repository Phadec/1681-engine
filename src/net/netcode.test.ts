import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INPUT_FLAG_DASH, type InputStep, type MovementParams } from './constants.ts';
import { InterpolationBuffer } from './InterpolationBuffer.ts';
import { createCollisionGrid } from './movement.ts';
import { PredictedMover } from './PredictedMover.ts';
import { Room } from './Room.ts';
import type { Snapshot } from './protocol.ts';

const params: MovementParams = { speed: 60, dashSpeed: 180, dashSteps: 6, dashCooldownSteps: 30, canMove: true, canDash: true };

function room20(): string {
  let s = '';
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) s += x === 0 || y === 0 || x === 19 || y === 19 || (x === 10 && y > 4 && y < 15) ? '1' : '0';
  return s;
}
const grid = createCollisionGrid(20, 20, 16, room20());

/** Messages in flight, each delivered after its own delay (ms of simulated time). */
class Wire<T> {
  private queue: { at: number; msg: T }[] = [];
  constructor(private readonly latency: () => number) {}
  send(now: number, msg: T): void {
    // a stream (TCP, WebSocket) never reorders: a message is never delivered before one sent earlier
    const last = this.queue[this.queue.length - 1]?.at ?? 0;
    this.queue.push({ at: Math.max(last, now + this.latency()), msg: structuredClone(msg) });
  }
  receive(now: number): T[] {
    const out: T[] = [];
    while (this.queue.length && this.queue[0]!.at <= now) out.push(this.queue.shift()!.msg);
    return out;
  }
}

/** A deterministic wandering input: walks, turns, rolls now and then, bumps into walls. */
function inputAt(i: number, who: number): InputStep {
  const phase = Math.floor((i + who * 37) / 45);
  const dirs: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [0, 0]];
  const [x, y] = dirs[(phase * 5 + who) % dirs.length]!;
  return [x, y, (i + who) % 97 === 0 ? INPUT_FLAG_DASH : 0];
}

function play(latency: () => number, steps = 900) {
  const room = new Room<{ name: string }>({ grid, params, spawn: (id) => ({ x: 48 + id * 24, y: 48 }) });
  const clients = [1, 2, 3].map((id) => {
    room.join(id, { name: `p${id}` });
    return {
      id,
      me: new PredictedMover(48 + id * 24, 48, params, grid),
      up: new Wire<{ seq: number; steps: InputStep[] }>(latency),
      down: new Wire<Snapshot>(latency),
      others: new InterpolationBuffer(100),
      corrections: [] as number[],
      seenOthers: new Set<number>(),
    };
  });
  const STEP = 1000 / 60;
  for (let i = 0; i < steps; i++) {
    const now = i * STEP;
    for (const c of clients) {
      const step = inputAt(i, c.id);
      const seq = c.me.step(step);
      c.up.send(now, { seq, steps: [step] });
    }
    for (const c of clients) for (const m of c.up.receive(now)) room.input(c.id, m.seq, m.steps);
    room.step();
    // snapshots at 20 Hz
    if (i % 3 === 0) for (const c of clients) c.down.send(now, room.snapshotFor(c.id, now)!);
    for (const c of clients) {
      for (const snap of c.down.receive(now)) {
        c.me.reconcile(snap.ack, snap.me!);
        c.corrections.push(c.me.correction);
        c.others.push(snap.time, snap.up!.filter((u) => u[0] !== c.id));
        for (const s of snap.sp ?? []) c.seenOthers.add(s.id);
      }
    }
  }
  // let everything in flight land, with no new input
  for (let i = steps; i < steps + 120; i++) {
    const now = i * STEP;
    for (const c of clients) for (const m of c.up.receive(now)) room.input(c.id, m.seq, m.steps);
    room.step();
    if (i % 3 === 0) for (const c of clients) c.down.send(now, room.snapshotFor(c.id, now)!);
    for (const c of clients) {
      for (const snap of c.down.receive(now)) {
        c.me.reconcile(snap.ack, snap.me!);
        c.others.push(snap.time, snap.up!.filter((u) => u[0] !== c.id));
      }
    }
  }
  return { room, clients };
}

test('with steady latency, prediction is never corrected and ends exactly where the server is', () => {
  const { room, clients } = play(() => 80);
  for (const c of clients) {
    assert.equal(Math.max(...c.corrections), 0, `client ${c.id} was corrected`);
    const server = room.players.get(c.id)!.mover;
    assert.equal(c.me.mover.x, server.x);
    assert.equal(c.me.mover.y, server.y);
    assert.equal(c.me.unacknowledged, 0);
  }
});

test('with jittery latency the same holds: order is kept, so replays stay exact', () => {
  let seed = 1;
  const jitter = () => 30 + ((seed = (seed * 16807) % 2147483647) % 150);
  const { room, clients } = play(jitter);
  for (const c of clients) {
    assert.equal(Math.max(...c.corrections), 0);
    assert.deepEqual([c.me.mover.x, c.me.mover.y], [room.players.get(c.id)!.mover.x, room.players.get(c.id)!.mover.y]);
  }
});

test('every client learns of the others, and draws them where the server had them a moment ago', () => {
  const { room, clients } = play(() => 50, 300);
  const c = clients[0]!;
  assert.deepEqual([...c.seenOthers].sort(), [1, 2, 3]);
  const other = room.players.get(2)!.mover;
  const drawn = c.others.sample(2, 419 * (1000 / 60))!;
  assert.ok(Math.hypot(drawn.x - other.x, drawn.y - other.y) < 2, 'idle at the end: drawn where it stands');
});

test('a server that disagrees is followed, and the jump is eased out of the drawing', () => {
  const me = new PredictedMover(100, 100, params, grid);
  for (let i = 0; i < 10; i++) me.step([1, 0, 0]);
  // the server says the body never moved (it refused the steps)
  me.reconcile(9, [100, 100, 1, 0, 0, 0, 1, 0]);
  assert.equal(me.mover.x, 100);
  assert.ok(me.correction > 9);
  assert.ok(me.drawX > 100, 'still drawn where it was');
  for (let i = 0; i < 60; i++) me.smooth(1 / 60);
  assert.equal(me.drawX, 100, 'eased all the way');
});

test('the room refuses nonsense input, resends and floods, and counts them', () => {
  const room = new Room({ grid, params, spawn: () => ({ x: 48, y: 48 }), maxQueue: 10 });
  const p = room.join(7, null);
  assert.equal(room.input(7, 0, [[Number.NaN, 0, 0]]), false);
  assert.equal(room.input(7, 0, [[5, 0, 0]]), false, 'an axis past 1');
  assert.equal(room.input(7, -1, [[1, 0, 0]]), false);
  assert.equal(room.input(7, 0, [[1, 0, 0], [1, 0, 0]]), true);
  assert.equal(room.input(7, 0, [[1, 0, 0], [1, 0, 0]]), true, 'a resend is skipped, not doubled');
  assert.equal(p.queue.length, 2);
  assert.equal(room.input(7, 2, Array.from({ length: 12 }, () => [1, 0, 0] as InputStep)), false, 'more in one message than the queue holds');
  assert.equal(room.input(7, 2, Array.from({ length: 9 }, () => [1, 0, 0] as InputStep)), false, 'past the queue');
  assert.equal(p.queue.length, 10);
  assert.ok(p.strikes >= 4);
  assert.equal(room.input(99, 0, []), false, 'nobody of that id');
});

test('a client cannot move faster by sending more: at most maxStepsPerTick a tick', () => {
  const room = new Room({ grid, params, spawn: () => ({ x: 48, y: 48 }), maxQueue: 60, maxStepsPerTick: 3, backlog: 4 });
  const p = room.join(1, null);
  room.input(1, 0, Array.from({ length: 60 }, () => [1, 0, 0] as InputStep));
  room.step();
  assert.equal(p.ack, 2, 'three steps, no more');
});

test('a body that leaves is announced once to the others', () => {
  const room = new Room({ grid, params, spawn: (id) => ({ x: 32 + id * 20, y: 48 }) });
  room.join(1, null);
  room.join(2, null);
  assert.deepEqual(room.snapshotFor(1, 0)!.sp?.map((s) => s.id).sort(), [1, 2]);
  assert.equal(room.snapshotFor(1, 0)!.sp, undefined, 'only once');
  room.leave(2);
  assert.deepEqual(room.snapshotFor(1, 0)!.rm, [2]);
  assert.equal(room.snapshotFor(1, 0)!.rm, undefined);
});

test('interpolation draws between snapshots and extrapolates only briefly', () => {
  const buf = new InterpolationBuffer(100, 50);
  buf.push(1000, [[5, 0, 0, 0, 0, 0, 0]]);
  buf.push(1100, [[5, 100, 0, 0, 0, 0, 0]]);
  assert.equal(buf.sample(5, 1150)!.x, 50, 'drawn 100 ms in the past, halfway');
  assert.equal(buf.sample(5, 1250)!.x, 150, 'past the newest: carried on 50 ms');
  assert.equal(buf.sample(5, 2000)!.x, 150, 'and no further');
  buf.push(1050, [[5, 999, 0, 0, 0, 0, 0]]);
  assert.equal(buf.sample(5, 1150)!.x, 50, 'a late, older snapshot is ignored');
  assert.equal(buf.sample(6, 1000), null);
});
