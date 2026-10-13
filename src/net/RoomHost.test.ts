import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Connection } from './Connection.ts';
import { type MovementParams } from './constants.ts';
import { createCollisionGrid } from './movement.ts';
import { PredictedMover } from './PredictedMover.ts';
import { Room } from './Room.ts';
import { RoomHost, type HostSocket } from './RoomHost.ts';
import type { Snapshot } from './protocol.ts';

const params: MovementParams = { speed: 60, dashSpeed: 180, dashSteps: 6, dashCooldownSteps: 30, canMove: true, canDash: true };
const grid = createCollisionGrid(8, 8, 16, '1'.repeat(8) + ('1' + '0'.repeat(6) + '1').repeat(6) + '1'.repeat(8));

/**
 * A WebSocket class whose sockets talk to a RoomHost in memory, each message delivered on a later task, as a real
 * socket would. Lets the real Connection run against the real host with no network.
 */
function fakeWebSocketFor(host: RoomHost<unknown>) {
  return class FakeWebSocket {
    readyState = 0;
    binaryType = 'blob';
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onclose: ((e: { code: number; reason: string }) => void) | null = null;
    private readonly id: number;
    constructor(_url: string) {
      const socket: HostSocket = {
        send: (data) => setTimeout(() => this.onmessage?.({ data: typeof data === 'string' ? data : data.slice().buffer }), 1),
        close: (code = 1000, reason = '') => setTimeout(() => this.shut(code, reason), 1),
      };
      this.id = host.connect(socket);
      setTimeout(() => {
        this.readyState = 1;
        this.onopen?.();
      }, 1);
    }
    send(data: string): void {
      setTimeout(() => host.message(this.id, data), 1);
    }
    close(): void {
      this.shut(1000, '');
    }
    private shut(code: number, reason: string): void {
      if (this.readyState === 3) return;
      this.readyState = 3;
      host.disconnect(this.id);
      this.onclose?.({ code, reason });
    }
  } as unknown as typeof WebSocket;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until `ok()` holds (timers run late on a busy machine; a fixed wait made these flaky). */
async function until(ok: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out');
    await wait(2);
  }
}

test('a client joins, walks with prediction, and the server agrees exactly', async () => {
  const room = new Room<{ name: string }>({ grid, params, spawn: () => ({ x: 40, y: 40 }) });
  const host = new RoomHost(room, { admit: (d) => ({ name: String((d as { name?: string })?.name ?? '?') }) });
  const conn = new Connection('ws://test', { WebSocket: fakeWebSocketFor(host as RoomHost<unknown>), hello: () => ({ name: 'ana' }), reconnect: false });
  const state: { me: PredictedMover | null; snaps: number } = { me: null, snaps: 0 };
  conn.events.on('welcome', () => (state.me = new PredictedMover(40, 40, params, grid)));
  conn.events.on('snapshot', (s: Snapshot) => {
    state.snaps++;
    state.me?.reconcile(s.ack, s.me!);
  });
  conn.connect();
  await until(() => state.me !== null);
  const me = state.me!;
  assert.equal(room.players.get(1)?.data.name, 'ana');
  for (let i = 0; i < 30; i++) {
    const step: [number, number, number] = [1, i % 2, 0];
    conn.queueInput(me.step(step), step);
    conn.flush();
    host.stepOnce();
    await wait(2);
  }
  // let every input land and be acknowledged
  await until(() => {
    host.stepOnce();
    return me.unacknowledged === 0;
  });
  assert.ok(state.snaps > 5);
  const server = room.players.get(1)!.mover;
  assert.equal(me.mover.x, server.x);
  assert.equal(me.mover.y, server.y);
  assert.ok(conn.rtt >= 0);
  conn.close();
  await until(() => room.players.size === 0);
});

test('a client sending nonsense is disconnected', async () => {
  const room = new Room({ grid, params, spawn: () => ({ x: 40, y: 40 }) });
  const host = new RoomHost(room, { maxStrikes: 3 });
  const conn = new Connection('ws://test', { WebSocket: fakeWebSocketFor(host as RoomHost<unknown>), reconnect: false });
  const closes: number[] = [];
  conn.events.on('close', (e) => closes.push(e.code));
  conn.connect();
  await until(() => room.players.size === 1);
  for (let i = 0; i < 3; i++) conn.send({ t: 'input', seq: 0, steps: [[Number.NaN, 0, 0]] } as never);
  await until(() => closes.length > 0);
  assert.deepEqual(closes, [4008]);
  assert.equal(room.players.size, 0);
});

test('a refused hello closes the socket with the reason', async () => {
  const room = new Room({ grid, params, spawn: () => ({ x: 40, y: 40 }) });
  const host = new RoomHost(room, {
    admit: () => {
      throw new Error('server full');
    },
  });
  const conn = new Connection('ws://test', { WebSocket: fakeWebSocketFor(host as RoomHost<unknown>), reconnect: false });
  const closes: string[] = [];
  conn.events.on('close', (e) => closes.push(e.reason));
  conn.connect();
  await until(() => closes.length > 0);
  assert.deepEqual(closes, ['server full']);
  assert.equal(room.players.size, 0);
});
