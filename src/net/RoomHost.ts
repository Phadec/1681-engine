import type { Room } from './Room';
import { encodeSnapshotFrame } from './snapshotCodec';
import type { ClientMessage, ServerMessage, Snapshot } from './protocol';

/** The least a server socket must do; a `ws` WebSocket, a uWebSockets one or a test double all fit. */
export interface HostSocket {
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
}

export interface RoomHostOptions<D> {
  /** Simulation steps a second (default 60) and snapshots a second (default 20). */
  stepRate?: number;
  snapRate?: number;
  /** Turns a hello's data into the player's data (validate it here); throw to refuse the player. */
  admit?: (data: unknown, id: number) => D;
  /** Refused inputs before the player is disconnected (default 20). */
  maxStrikes?: number;
  /** The game's own messages (anything the engine does not handle). */
  onMessage?: (id: number, msg: { t: string; [k: string]: unknown }) => void;
  /** Called when a player joins or leaves. */
  onJoin?: (id: number) => void;
  onLeave?: (id: number) => void;
  /** Wall clock, for tests (default Date.now). */
  now?: () => number;
}

/**
 * Runs a `Room` for connected sockets: a socket says hello and joins, its input goes to the room, the room steps at
 * `stepRate`, and every player gets its own snapshot at `snapRate` (binary when it carries bodies). Pings are
 * answered with the server's time. A player who keeps sending nonsense is disconnected.
 *
 * ```ts
 * const host = new RoomHost(room);
 * wss.on('connection', (ws) => {
 *   const id = host.connect(ws);
 *   ws.on('message', (data, binary) => host.message(id, binary ? data : data.toString()));
 *   ws.on('close', () => host.disconnect(id));
 * });
 * host.start();
 * ```
 */
export class RoomHost<D = unknown> {
  private readonly sockets = new Map<number, HostSocket>();
  private readonly joined = new Set<number>();
  private nextId = 1;
  private stepTimer: ReturnType<typeof setInterval> | null = null;
  private lastStepAt = 0;
  private stepsDue = 0;
  private readonly stepMs: number;
  private readonly snapEvery: number;
  private readonly now: () => number;

  constructor(
    readonly room: Room<D>,
    private readonly options: RoomHostOptions<D> = {},
  ) {
    this.stepMs = 1000 / (options.stepRate ?? 60);
    this.snapEvery = Math.max(1, Math.round((options.stepRate ?? 60) / (options.snapRate ?? 20)));
    this.now = options.now ?? Date.now;
  }

  /** A socket connected; returns the id its messages and its close are reported under. */
  connect(socket: HostSocket): number {
    const id = this.nextId++;
    this.sockets.set(id, socket);
    return id;
  }

  /** A message arrived from socket `id` (text as a string, binary as bytes). */
  message(id: number, data: string | ArrayBuffer | Uint8Array): void {
    if (typeof data !== 'string') return; // clients send JSON only
    let msg: ClientMessage | { t: string; [k: string]: unknown };
    try {
      msg = JSON.parse(data);
    } catch {
      return this.strike(id);
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return this.strike(id);
    switch (msg.t) {
      case 'hello': {
        if (this.joined.has(id)) return;
        let data: D;
        try {
          data = this.options.admit ? this.options.admit((msg as { data?: unknown }).data, id) : ((msg as { data?: unknown }).data as D);
        } catch (err) {
          this.sockets.get(id)?.close(4003, err instanceof Error ? err.message : 'refused');
          return;
        }
        this.room.join(id, data);
        this.joined.add(id);
        this.sendTo(id, { t: 'welcome', id, tick: this.room.tick, stepRate: 1000 / this.stepMs, snapRate: (1000 / this.stepMs) / this.snapEvery });
        this.options.onJoin?.(id);
        return;
      }
      case 'input': {
        const m = msg as Extract<ClientMessage, { t: 'input' }>;
        if (!this.joined.has(id)) return;
        if (!this.room.input(id, m.seq, m.steps)) this.checkStrikes(id);
        return;
      }
      case 'ping': {
        const c = (msg as { c?: unknown }).c;
        if (typeof c === 'number' && Number.isFinite(c)) this.sendTo(id, { t: 'pong', c, st: this.now() });
        return;
      }
      default:
        if (this.joined.has(id)) this.options.onMessage?.(id, msg as { t: string; [k: string]: unknown });
    }
  }

  /** Socket `id` closed. */
  disconnect(id: number): void {
    this.sockets.delete(id);
    if (this.joined.delete(id)) {
      this.room.leave(id);
      this.options.onLeave?.(id);
    }
  }

  /** Sends one of the game's own messages to a player. */
  sendTo(id: number, msg: ServerMessage | { t: string; [k: string]: unknown }): void {
    const s = this.sockets.get(id);
    if (!s) return;
    if ((msg as Snapshot).t === 'snap' && (msg as Snapshot).up?.length) s.send(encodeSnapshotFrame(msg as Snapshot));
    else s.send(JSON.stringify(msg));
  }

  /** Starts stepping on a timer. Steps are counted by the clock, so a late timer runs the steps it owes. */
  start(): void {
    if (this.stepTimer) return;
    this.lastStepAt = this.now();
    this.stepTimer = setInterval(() => {
      const now = this.now();
      this.stepsDue += (now - this.lastStepAt) / this.stepMs;
      this.lastStepAt = now;
      // a stall longer than a second is not caught up: the room just carries on
      this.stepsDue = Math.min(this.stepsDue, 60);
      while (this.stepsDue >= 1) {
        this.stepsDue--;
        this.stepOnce();
      }
    }, this.stepMs / 2);
  }

  stop(): void {
    if (this.stepTimer) clearInterval(this.stepTimer);
    this.stepTimer = null;
  }

  /** One step, and the snapshots when they are due. Exposed for tests and for servers that drive their own loop. */
  stepOnce(): void {
    this.room.step();
    if (this.room.tick % this.snapEvery !== 0) return;
    const now = this.now();
    for (const id of this.joined) {
      const snap = this.room.snapshotFor(id, now);
      if (snap) this.sendTo(id, snap);
    }
  }

  private strike(id: number): void {
    const p = this.room.players.get(id);
    if (p) {
      p.strikes++;
      this.checkStrikes(id);
    }
  }

  private checkStrikes(id: number): void {
    const p = this.room.players.get(id);
    if (p && p.strikes >= (this.options.maxStrikes ?? 20)) {
      this.sockets.get(id)?.close(4008, 'too much invalid input');
      this.disconnect(id);
    }
  }
}
