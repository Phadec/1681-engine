import { EventBus } from '../events/EventBus';
import type { InputStep } from './constants';
import { noteServerTime } from './serverClock';
import { decodeSnapshotFrame } from './snapshotCodec';
import type { ClientMessage, ServerMessage, Snapshot } from './protocol';

export interface ConnectionEvents {
  open: undefined;
  /** The socket closed; `willRetry` when it will reconnect by itself. */
  close: { code: number; reason: string; willRetry: boolean };
  welcome: Extract<ServerMessage, { t: 'welcome' }>;
  snapshot: Snapshot;
  /** Any message the engine does not handle: the game's own. */
  message: { t: string; [k: string]: unknown };
}

export interface ConnectionOptions {
  /** Reconnect after the socket drops (default true), waiting longer each time up to `maxBackoffMs`. */
  reconnect?: boolean;
  maxBackoffMs?: number;
  /** Ping interval for the server clock and the round-trip time (default 1000 ms). */
  pingMs?: number;
  /** Sent on every (re)connect as `hello.data`. */
  hello?: () => unknown;
  /** The WebSocket class (default the global one; Node 22+ and browsers have it). */
  WebSocket?: typeof WebSocket;
}

/**
 * The client side of the engine's netcode over a WebSocket: hello on open, input steps batched and sent once a frame
 * (`queueInput` then `flush`), snapshots decoded (binary or JSON) onto `events`, pings that keep the server clock
 * (`serverNow`) and `rtt` up to date, and reconnection with backoff.
 */
export class Connection {
  readonly events = new EventBus<ConnectionEvents>();
  /** The last measured round trip, ms. */
  rtt = 0;
  private socket: WebSocket | null = null;
  private batch: { seq: number; steps: InputStep[] } | null = null;
  private closedByUs = false;
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly url: string,
    private readonly options: ConnectionOptions = {},
  ) {}

  get open(): boolean {
    return this.socket?.readyState === 1;
  }

  connect(): this {
    this.closedByUs = false;
    const Impl = this.options.WebSocket ?? globalThis.WebSocket;
    if (!Impl) throw new Error('Connection: no WebSocket in this environment');
    const ws = new Impl(this.url);
    ws.binaryType = 'arraybuffer';
    this.socket = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.send({ t: 'hello', data: this.options.hello?.() });
      this.ping();
      this.pingTimer = setInterval(() => this.ping(), this.options.pingMs ?? 1000);
      this.events.emit('open', undefined);
    };
    ws.onmessage = (e) => this.receive(e.data);
    ws.onclose = (e) => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.socket = null;
      const willRetry = !this.closedByUs && this.options.reconnect !== false;
      this.events.emit('close', { code: e.code, reason: e.reason, willRetry });
      if (willRetry) {
        const wait = Math.min(this.options.maxBackoffMs ?? 10_000, 250 * 2 ** this.attempt++);
        this.retryTimer = setTimeout(() => this.connect(), wait);
      }
    };
    return this;
  }

  /** Sends a message now (dropped while closed: input is resent by the prediction's own state, not by the socket). */
  send(msg: ClientMessage | { t: string; [k: string]: unknown }): void {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(msg));
  }

  /** Adds one input step to this frame's batch; `flush` sends it. Steps must come in sequence order. */
  queueInput(seq: number, step: InputStep): void {
    if (!this.batch) this.batch = { seq, steps: [] };
    this.batch.steps.push([step[0], step[1], step[2]]);
  }

  /** Sends this frame's input steps as one message. Call once a frame. */
  flush(): void {
    if (!this.batch) return;
    this.send({ t: 'input', seq: this.batch.seq, steps: this.batch.steps });
    this.batch = null;
  }

  close(): void {
    this.closedByUs = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.socket?.close();
    this.socket = null;
  }

  private ping(): void {
    this.send({ t: 'ping', c: Date.now() });
  }

  private receive(data: unknown): void {
    let msg: ServerMessage | { t: string; [k: string]: unknown };
    try {
      msg = typeof data === 'string' ? JSON.parse(data) : (decodeSnapshotFrame<Snapshot>(data as ArrayBuffer) as Snapshot);
    } catch (err) {
      console.error('[net] could not read a message', err);
      return;
    }
    switch (msg.t) {
      case 'pong': {
        const m = msg as Extract<ServerMessage, { t: 'pong' }>;
        this.rtt = Date.now() - m.c;
        noteServerTime(m.st, this.rtt);
        return;
      }
      case 'welcome':
        this.events.emit('welcome', msg as Extract<ServerMessage, { t: 'welcome' }>);
        return;
      case 'snap':
        this.events.emit('snapshot', msg as Snapshot);
        return;
      default:
        this.events.emit('message', msg as { t: string; [k: string]: unknown });
    }
  }
}
