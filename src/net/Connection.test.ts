import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLOSE_NO_ANSWER, Connection } from './Connection.ts';
import { reconnectDelay, shouldReconnect } from './reconnect.ts';

test('the reconnect wait doubles up to its ceiling', () => {
  assert.deepEqual([0, 1, 2, 3, 10].map((a) => reconnectDelay(a)), [250, 500, 1000, 2000, 10_000]);
  assert.equal(reconnectDelay(3, 1500), 1500);
});

test('a fatal close code, our own close or reconnecting off never retries', () => {
  assert.equal(shouldReconnect(1006, { closedByUs: false }), true);
  assert.equal(shouldReconnect(4001, { closedByUs: false, fatalCloseCodes: [4001] }), false);
  assert.equal(shouldReconnect(1006, { closedByUs: true }), false);
  assert.equal(shouldReconnect(1006, { closedByUs: false, reconnect: false }), false);
});

/** A WebSocket stand-in that records what is sent and lets the test open, answer and close it. */
class FakeSocket {
  static made: FakeSocket[] = [];
  readyState = 0;
  binaryType = '';
  sent: { t: string; c?: number }[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.made.push(this);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  drop(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: '' });
  }
}

function connection(options: ConstructorParameters<typeof Connection>[1] = {}): { conn: Connection; closes: { code: number; willRetry: boolean }[] } {
  FakeSocket.made = [];
  const conn = new Connection('ws://test', { pingMs: 60_000, ...options, WebSocket: FakeSocket as unknown as typeof WebSocket });
  const closes: { code: number; willRetry: boolean }[] = [];
  conn.events.on('close', (e) => closes.push({ code: e.code, willRetry: e.willRetry }));
  return { conn, closes };
}

test('a fatal close code is reported without a retry', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { conn, closes } = connection({ fatalCloseCodes: [4003] });
  conn.connect();
  FakeSocket.made[0]!.open();
  FakeSocket.made[0]!.drop(4003);
  t.mock.timers.tick(60_000);
  assert.deepEqual(closes, [{ code: 4003, willRetry: false }]);
  assert.equal(FakeSocket.made.length, 1);
  conn.close();
});

test('after a resume, a socket that does not answer is dropped and reconnected', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let resume = (): void => {};
  const { conn, closes } = connection({ resumeProbeMs: 2000, onResume: (cb) => ((resume = cb), () => {}) });
  conn.connect();
  const ws = FakeSocket.made[0]!;
  ws.open();
  resume();
  assert.equal(ws.sent.at(-1)!.t, 'ping');
  t.mock.timers.tick(2000);
  assert.deepEqual(closes, [{ code: CLOSE_NO_ANSWER, willRetry: true }]);
  t.mock.timers.tick(250);
  assert.equal(FakeSocket.made.length, 2, 'it did not reconnect');
  conn.close();
});

test('after a resume, a pong in time keeps the socket', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let resume = (): void => {};
  const { conn, closes } = connection({ resumeProbeMs: 2000, onResume: (cb) => ((resume = cb), () => {}) });
  conn.connect();
  const ws = FakeSocket.made[0]!;
  ws.open();
  resume();
  ws.onmessage?.({ data: JSON.stringify({ t: 'pong', c: ws.sent.at(-1)!.c, st: 0 }) });
  t.mock.timers.tick(5000);
  assert.deepEqual(closes, []);
  assert.equal(conn.open, true);
  conn.close();
});

test('the probe is off by default', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let subscribed = false;
  const { conn } = connection({ onResume: () => ((subscribed = true), () => {}) });
  conn.connect();
  assert.equal(subscribed, false);
  conn.close();
});
