import { EventBus } from '../events/EventBus';
import { onAppResume } from '../platform/appResume';
import type { InputStep } from './constants';
import { noteServerTime } from './serverClock';
import { decodeSnapshotFrame } from './snapshotCodec';
import type { ClientMessage, ServerMessage, Snapshot } from './protocol';
import { reconnectDelay, shouldReconnect } from './reconnect';

/** The close code `Connection` reports when it gave up on a socket that did not answer after a resume. */
export const CLOSE_NO_ANSWER = 4408;

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
  /**
   * Close codes after which it must not reconnect (default none): the server's "kicked", "banned", "update required"…
   * The close event then says `willRetry: false`.
   */
  fatalCloseCodes?: readonly number[];
  /**
   * After the app returns from the background, ping and give the server this long to answer (default 0: off). A phone
   * that froze the tab can come back to a socket that still says it is open and is dead; with no pong in time the
   * socket is dropped (close code `CLOSE_NO_ANSWER`) and reconnected as after any drop.
   */
  resumeProbeMs?: number;
  /** How the probe hears of a resume (default `onAppResume`); returns the unsubscribe. */
  onResume?: (cb: () => void) => () => void;
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
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private stopResume: (() => void) | null = null;

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
      // a socket already replaced by a newer one has nothing left to report
      if (this.socket === ws || this.socket === null) this.closed(e.code, e.reason);
    };
    if ((this.options.resumeProbeMs ?? 0) > 0 && !this.stopResume) {
      this.stopResume = (this.options.onResume ?? onAppResume)(() => this.probe());
    }
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
    this.clearProbe();
    this.stopResume?.();
    this.stopResume = null;
    this.socket?.close();
    this.socket = null;
  }

  /** The socket is gone (closed, or given up on): report it and reconnect unless told not to. */
  private closed(code: number, reason: string): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.clearProbe();
    this.socket = null;
    const willRetry = shouldReconnect(code, { closedByUs: this.closedByUs, reconnect: this.options.reconnect, fatalCloseCodes: this.options.fatalCloseCodes });
    this.events.emit('close', { code, reason, willRetry });
    if (willRetry) this.retryTimer = setTimeout(() => this.connect(), reconnectDelay(this.attempt++, this.options.maxBackoffMs));
  }

  /** Back from the background: a pong within `resumeProbeMs` proves the socket alive, none drops it. */
  private probe(): void {
    const ws = this.socket;
    if (!ws || ws.readyState !== 1 || this.probeTimer) return;
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null;
      if (this.socket !== ws) return;
      // a dead socket's close() may not fire onclose for a minute: stop listening to it and move on now
      ws.onopen = ws.onmessage = ws.onclose = null;
      try {
        ws.close();
      } catch {
        // already closing
      }
      this.closed(CLOSE_NO_ANSWER, 'no answer after resume');
    }, this.options.resumeProbeMs);
    this.ping();
  }

  private clearProbe(): void {
    if (this.probeTimer) clearTimeout(this.probeTimer);
    this.probeTimer = null;
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
        this.clearProbe();
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
