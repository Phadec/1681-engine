import type { HostSocket } from '../RoomHost';
import { LobbyRooms, type LobbyRoom } from './LobbyRooms';
import type { LobbyClientMessage, LobbyErrorCode, LobbyServerMessage, MatchPlayer } from './lobbyProtocol';
import { Matchmaker, type FoundMatch, type MatchMode, type Ticket } from './Matchmaker';

/** A match the lobby made (from the queue or a room's start), as `onStart` is given it. */
export interface LobbyMatch<D> {
  id: string;
  mode: string;
  players: (MatchPlayer & { data: D })[];
  /** The lobby room it was started from, for a room's own game. */
  room?: string;
  /** That room's settings. */
  settings?: unknown;
}

export interface LobbyHostOptions<D> {
  /** Modes the queue fills (none: rooms only). */
  modes?: readonly MatchMode[];
  /** Turns a hello's data into the player's public data (validate it here); throw to refuse the player. */
  admit?: (data: unknown, id: number) => D;
  /** A player's rating in a mode (default 1000 for everyone). A party queues at its members' mean. */
  ratingOf?: (id: number, data: D, mode: string) => number;
  /**
   * Called when a match starts (everyone accepted, or a room's host started). Return what each player is told to go
   * to — a game server's address and a ticket, a room id on this server — as one value for all, or a function of
   * the player's id. Throw to cancel the start (everyone is told it was cancelled and requeued).
   */
  onStart?: (match: LobbyMatch<D>) => unknown;
  /** Time to accept a found match (default 15 s); 0 starts it at once. */
  readyCheckMs?: number;
  /** How long one who declined or let the check lapse is kept out of the queue (default 30 s). */
  declineLockMs?: number;
  /** Most players a room may hold (default 8), and rooms listed at once (default 50). */
  maxRoomPlayers?: number;
  listLimit?: number;
  /** Characters of a chat line (default 200) and of a room name (default 32). */
  chatMax?: number;
  nameMax?: number;
  /** Messages a player may send a second before they are refused (default 20); three times it closes the socket. */
  ratePerSecond?: number;
  /** How often the queue is searched (default 1000 ms). */
  matchEveryMs?: number;
  /** The game's own messages (anything the lobby does not handle). */
  onMessage?: (id: number, msg: { t: string; [k: string]: unknown }) => void;
  onJoin?: (id: number) => void;
  onLeave?: (id: number) => void;
  /** Clock and dice, for tests. */
  now?: () => number;
  random?: () => number;
}

interface Member<D> {
  readonly id: number;
  data: D;
  /** The ticket it waits on alone (`p:<id>`), or its room's. */
  ticket: string | null;
  lockedUntil: number;
  match: string | null;
  rateWindow: number;
  rateCount: number;
}

interface Pending {
  id: string;
  found: FoundMatch;
  players: MatchPlayer[];
  accepted: Set<number>;
  declined: Set<number>;
  expiresAt: number;
}

/**
 * The front room of an online game, transport-free like `RoomHost`: players say hello and browse rooms; a room has a
 * host, a code to share, ready flags, chat and the game's own settings; a player alone or a whole room queues for a
 * mode, the `Matchmaker` finds matches by rating, and each match goes through a ready check before `onStart` turns it
 * into a game. Someone who declines (or lets the check lapse) is locked out of the queue for a while; everyone else
 * goes back to their old place in it.
 *
 * ```ts
 * const lobby = new LobbyHost({
 *   modes: [{ id: 'duel', teams: 2, teamSize: 1 }, { id: '2v2', teams: 2, teamSize: 2 }],
 *   admit: (d) => ({ name: String((d as { name?: unknown })?.name ?? 'player').slice(0, 16) }),
 *   ratingOf: (id) => ratings.get(id) ?? 1000,
 *   onStart: (match) => ({ server: 'wss://eu1.example.com', ticket: issueTicket(match) }),
 * });
 * wss.on('connection', (ws) => {
 *   const id = lobby.connect(ws);
 *   ws.on('message', (data, binary) => lobby.message(id, binary ? '' : data.toString()));
 *   ws.on('close', () => lobby.disconnect(id));
 * });
 * lobby.start();
 * ```
 */
export class LobbyHost<D = unknown> {
  readonly rooms: LobbyRooms;
  readonly matchmaker: Matchmaker;
  private readonly sockets = new Map<number, HostSocket>();
  private readonly members = new Map<number, Member<D>>();
  private readonly pending = new Map<string, Pending>();
  /** Rooms whose match started, by match id, so `finish` can open them again. */
  private readonly playing = new Map<string, string[]>();
  private nextId = 1;
  private nextMatch = 1;
  private listDirty = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;

  constructor(private readonly options: LobbyHostOptions<D> = {}) {
    this.now = options.now ?? Date.now;
    this.rooms = new LobbyRooms(options.random);
    this.matchmaker = new Matchmaker(options.modes ?? []);
  }

  /** A socket connected; returns the id its messages and its close are reported under. */
  connect(socket: HostSocket): number {
    const id = this.nextId++;
    this.sockets.set(id, socket);
    return id;
  }

  /** Socket `id` closed: out of its room, the queue and any match being accepted. */
  disconnect(id: number): void {
    this.sockets.delete(id);
    const m = this.members.get(id);
    if (!m) return;
    this.leaveQueue(m, false);
    this.cancelPendingFor(id, 'left');
    this.leaveRoom(m);
    this.members.delete(id);
    this.options.onLeave?.(id);
  }

  /** A message arrived from socket `id`. */
  message(id: number, data: string | ArrayBuffer | Uint8Array): void {
    if (typeof data !== 'string') return;
    let msg: { t?: unknown; [k: string]: unknown };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    if (msg.t === 'hello') return this.hello(id, msg.data);
    if (msg.t === 'ping') {
      if (typeof msg.c === 'number' && Number.isFinite(msg.c)) this.send(id, { t: 'pong', c: msg.c, st: this.now() });
      return;
    }
    const m = this.members.get(id);
    if (!m || !this.allow(m)) return;
    const handled = this.handle(m, msg as LobbyClientMessage);
    if (!handled) this.options.onMessage?.(id, msg as { t: string; [k: string]: unknown });
  }

  /** A player's public data (what `admit` returned). */
  dataOf(id: number): D | undefined {
    return this.members.get(id)?.data;
  }

  /** Sends one of the game's own messages to a player. */
  send(id: number, msg: LobbyServerMessage | { t: string; [k: string]: unknown }): void {
    this.sockets.get(id)?.send(JSON.stringify(msg));
  }

  /** Searches the queue and runs the ready checks on a timer. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.update(), this.options.matchEveryMs ?? 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One round: lapsed ready checks cancelled, the queue searched, the room list pushed if it changed. */
  update(now = this.now()): void {
    for (const p of [...this.pending.values()]) if (now >= p.expiresAt) this.cancel(p, 'timeout');
    for (const found of this.matchmaker.find(now)) this.found(found, now);
    if (this.listDirty) this.pushList();
  }

  /** A started match is over: its rooms open again, their members not ready. */
  finish(matchId: string): void {
    const rooms = this.playing.get(matchId);
    this.playing.delete(matchId);
    for (const r of rooms ?? []) {
      const room = this.rooms.get(r);
      if (!room) continue;
      room.playing = false;
      room.ready.clear();
      this.pushRoom(room);
    }
    this.listDirty = true;
  }

  // ── messages ─────────────────────────────────────────────────────────────────────────────────────────────────

  private hello(id: number, data: unknown): void {
    if (this.members.has(id)) return;
    let d: D;
    try {
      d = this.options.admit ? this.options.admit(data, id) : (data as D);
    } catch (err) {
      this.sockets.get(id)?.close(4003, err instanceof Error ? err.message : 'refused');
      return;
    }
    this.members.set(id, { id, data: d, ticket: null, lockedUntil: 0, match: null, rateWindow: 0, rateCount: 0 });
    this.send(id, { t: 'lobby/welcome', id, modes: (this.options.modes ?? []).map((m) => m.id) });
    this.send(id, { t: 'lobby/rooms', rooms: this.rooms.listed(this.options.listLimit ?? 50) });
    this.options.onJoin?.(id);
  }

  /** True when the lobby handled it (or refused it). */
  private handle(m: Member<D>, msg: LobbyClientMessage): boolean {
    switch (msg.t) {
      case 'lobby/list':
        this.send(m.id, { t: 'lobby/rooms', rooms: this.rooms.listed(this.options.listLimit ?? 50) });
        return true;
      case 'lobby/create':
        this.create(m, msg);
        return true;
      case 'lobby/join':
        this.join(m, msg);
        return true;
      case 'lobby/leave':
        if (!this.rooms.of(m.id)) this.error(m, 'not-in-room', 'You are not in a room');
        else {
          if (m.match) this.cancelPendingFor(m.id, 'left');
          this.leaveRoom(m);
        }
        return true;
      case 'lobby/ready':
        this.ready(m, msg.ready === true);
        return true;
      case 'lobby/kick':
        this.kick(m, msg.player);
        return true;
      case 'lobby/promote':
        this.promote(m, msg.player);
        return true;
      case 'lobby/settings': {
        const room = this.hostRoom(m);
        if (room && (room.queued || room.playing)) this.error(m, 'room-busy', 'Leave the queue first');
        else if (room) {
          room.settings = msg.settings;
          room.ready.clear(); // changed rules: everyone says again that they are ready
          this.pushRoom(room);
        }
        return true;
      }
      case 'lobby/chat': {
        const room = this.rooms.of(m.id);
        if (!room || typeof msg.text !== 'string') {
          this.error(m, 'not-in-room', 'You are not in a room');
          return true;
        }
        const text = msg.text.trim().slice(0, this.options.chatMax ?? 200);
        if (text) for (const id of room.members) this.send(id, { t: 'lobby/chat', from: m.id, text });
        return true;
      }
      case 'lobby/start':
        this.startRoom(m);
        return true;
      case 'queue/join':
        this.queue(m, msg.mode);
        return true;
      case 'queue/leave':
        this.leaveQueue(m, true);
        return true;
      case 'match/accept':
        this.answer(m, true);
        return true;
      case 'match/decline':
        this.answer(m, false);
        return true;
      default:
        return false;
    }
  }

  private create(m: Member<D>, msg: Extract<LobbyClientMessage, { t: 'lobby/create' }>): void {
    if (this.rooms.of(m.id)) return this.error(m, 'in-room', 'Leave your room first');
    if (m.ticket || m.match) return this.error(m, 'queued', 'Leave the queue first');
    const limit = this.options.maxRoomPlayers ?? 8;
    const max = Number.isInteger(msg.maxPlayers) ? Math.max(1, Math.min(limit, msg.maxPlayers!)) : limit;
    const modes = this.options.modes ?? [];
    const mode = typeof msg.mode === 'string' ? msg.mode.slice(0, 32) : (modes[0]?.id ?? 'custom');
    const name = typeof msg.name === 'string' && msg.name.trim() ? msg.name.trim().slice(0, this.options.nameMax ?? 32) : `Room ${this.rooms.count + 1}`;
    const room = this.rooms.create(m.id, { name, mode, maxPlayers: max, private: msg.private === true, settings: msg.settings ?? null });
    this.pushRoom(room);
    this.listDirty = true;
  }

  private join(m: Member<D>, msg: Extract<LobbyClientMessage, { t: 'lobby/join' }>): void {
    if (this.rooms.of(m.id)) return this.error(m, 'in-room', 'Leave your room first');
    if (m.ticket || m.match) return this.error(m, 'queued', 'Leave the queue first');
    const room = typeof msg.code === 'string' ? this.rooms.byInvite(msg.code) : typeof msg.room === 'string' ? this.rooms.get(msg.room) : undefined;
    // a private room is found only by its code
    if (!room || (room.private && typeof msg.code !== 'string')) return this.error(m, 'no-room', 'No such room');
    if (room.queued || room.playing) return this.error(m, 'room-busy', 'That room is busy');
    if (room.members.length >= room.maxPlayers) return this.error(m, 'room-full', 'That room is full');
    this.rooms.join(m.id, room);
    this.pushRoom(room);
    this.listDirty = true;
  }

  private ready(m: Member<D>, ready: boolean): void {
    const room = this.rooms.of(m.id);
    if (!room) return this.error(m, 'not-in-room', 'You are not in a room');
    if (room.queued || room.playing) return this.error(m, 'room-busy', 'Leave the queue first');
    if (ready) room.ready.add(m.id);
    else room.ready.delete(m.id);
    this.pushRoom(room);
  }

  private kick(m: Member<D>, player: unknown): void {
    const room = this.hostRoom(m);
    if (!room || typeof player !== 'number' || player === m.id || !room.members.includes(player)) return;
    const target = this.members.get(player);
    if (!target) return;
    if (room.queued) this.dequeueRoom(room);
    this.leaveRoom(target);
    this.send(player, { t: 'lobby/kicked' });
  }

  private promote(m: Member<D>, player: unknown): void {
    const room = this.hostRoom(m);
    if (!room || typeof player !== 'number' || !room.members.includes(player) || player === m.id) return;
    room.host = player;
    room.ready.delete(player);
    this.pushRoom(room);
  }

  /** The room `m` hosts, or an error to them. */
  private hostRoom(m: Member<D>): LobbyRoom | null {
    const room = this.rooms.of(m.id);
    if (!room) this.error(m, 'not-in-room', 'You are not in a room');
    else if (room.host !== m.id) this.error(m, 'not-host', 'Only the host can do that');
    else return room;
    return null;
  }

  private startRoom(m: Member<D>): void {
    const room = this.hostRoom(m);
    if (!room) return;
    if (room.queued || room.playing) return this.error(m, 'room-busy', 'That room is busy');
    if (!this.rooms.allReady(room)) return this.error(m, 'not-ready', 'Not everyone is ready');
    const id = `M${this.nextMatch++}`;
    const players: MatchPlayer[] = room.members.map((p) => ({ id: p, data: this.members.get(p)?.data, team: 0 }));
    room.playing = true;
    this.listDirty = true;
    if (!this.begin(id, room.mode, players, [room], room)) {
      room.playing = false;
      return;
    }
    this.pushRoom(room);
  }

  // ── the queue ────────────────────────────────────────────────────────────────────────────────────────────────

  private queue(m: Member<D>, modeId: unknown): void {
    const mode = typeof modeId === 'string' ? this.matchmaker.mode(modeId) : undefined;
    if (!mode) return this.error(m, 'no-mode', 'No such mode');
    if (m.match) return this.error(m, 'queued', 'A match is waiting for you');
    const room = this.rooms.of(m.id);
    const group = room ? room.members : [m.id];
    if (room) {
      if (room.host !== m.id) return this.error(m, 'not-host', 'Only the host can queue the room');
      if (room.queued || room.playing) return this.error(m, 'room-busy', 'The room is already queued');
      if (!this.rooms.allReady(room)) return this.error(m, 'not-ready', 'Not everyone is ready');
    } else if (m.ticket) return this.error(m, 'queued', 'You are already queued');
    if (group.length > mode.teamSize) return this.error(m, 'too-many', `A team holds ${mode.teamSize}`);
    const now = this.now();
    const locked = Math.max(...group.map((id) => this.members.get(id)?.lockedUntil ?? 0));
    if (locked > now) {
      this.send(m.id, { t: 'queue/locked', until: locked });
      return this.error(m, 'locked', 'Someone in your group declined a match recently');
    }
    const ticket: Ticket = { id: room ? `r:${room.id}` : `p:${m.id}`, mode: mode.id, members: [...group], rating: this.ratingOf(group, mode.id), since: now };
    this.matchmaker.add(ticket);
    if (room) {
      room.queued = true;
      this.pushRoom(room);
      this.listDirty = true;
    }
    for (const id of group) {
      const member = this.members.get(id);
      if (member) member.ticket = ticket.id;
    }
    this.pushQueue(ticket);
  }

  private ratingOf(group: readonly number[], mode: string): number {
    const of = this.options.ratingOf;
    if (!of) return 1000;
    let sum = 0;
    for (const id of group) sum += of(id, this.members.get(id)!.data, mode);
    return sum / group.length;
  }

  /** Takes `m` (or its whole room) out of the queue. */
  private leaveQueue(m: Member<D>, tell: boolean): void {
    if (!m.ticket) {
      if (tell) this.error(m, 'queued', 'You are not queued');
      return;
    }
    const room = this.rooms.of(m.id);
    if (room?.queued) return this.dequeueRoom(room);
    this.matchmaker.remove(m.ticket);
    m.ticket = null;
    if (tell) this.send(m.id, { t: 'queue/status', mode: null, since: 0, waiting: 0 });
  }

  private dequeueRoom(room: LobbyRoom): void {
    this.matchmaker.remove(`r:${room.id}`);
    room.queued = false;
    for (const id of room.members) {
      const member = this.members.get(id);
      if (member) member.ticket = null;
      this.send(id, { t: 'queue/status', mode: null, since: 0, waiting: 0 });
    }
    this.pushRoom(room);
    this.listDirty = true;
  }

  private pushQueue(t: Ticket): void {
    const waiting = this.matchmaker.waiting(t.mode).length - 1;
    for (const id of t.members) this.send(id, { t: 'queue/status', mode: t.mode, since: t.since, waiting });
  }

  // ── found matches and the ready check ───────────────────────────────────────────────────────────────────────

  private found(found: FoundMatch, now: number): void {
    const id = `M${this.nextMatch++}`;
    const players: MatchPlayer[] = found.teams.flatMap((team, i) => team.map((p) => ({ id: p, data: this.members.get(p)?.data, team: i })));
    for (const p of players) {
      const member = this.members.get(p.id);
      if (member) {
        member.ticket = null;
        member.match = id;
      }
    }
    const readyMs = this.options.readyCheckMs ?? 15_000;
    if (readyMs <= 0) {
      this.startFound(id, found, players);
      return;
    }
    const pending: Pending = { id, found, players, accepted: new Set(), declined: new Set(), expiresAt: now + readyMs };
    this.pending.set(id, pending);
    for (const p of players) this.send(p.id, { t: 'match/found', match: id, mode: found.mode, players, expiresAt: pending.expiresAt });
  }

  private answer(m: Member<D>, yes: boolean): void {
    const p = m.match ? this.pending.get(m.match) : undefined;
    if (!p) return;
    if (!yes) {
      p.declined.add(m.id);
      return this.cancel(p, 'declined');
    }
    p.accepted.add(m.id);
    const accepted = [...p.accepted];
    for (const pl of p.players) this.send(pl.id, { t: 'match/accepted', match: p.id, accepted });
    if (p.accepted.size === p.players.length) {
      this.pending.delete(p.id);
      this.startFound(p.id, p.found, p.players);
    }
  }

  private startFound(id: string, found: FoundMatch, players: MatchPlayer[]): void {
    const rooms = found.tickets.filter((t) => t.id.startsWith('r:')).map((t) => this.rooms.get(t.id.slice(2))).filter((r): r is LobbyRoom => !!r);
    for (const r of rooms) {
      r.queued = false;
      r.playing = true;
    }
    if (!this.begin(id, found.mode, players, rooms)) {
      for (const r of rooms) {
        r.playing = false;
        r.queued = true;
      }
      for (const t of found.tickets) this.requeue(t);
      return;
    }
    for (const r of rooms) this.pushRoom(r);
    this.listDirty = true;
  }

  /** Calls `onStart` and tells everyone where to go; false (nothing sent) when it threw. */
  private begin(id: string, mode: string, players: MatchPlayer[], rooms: LobbyRoom[], from?: LobbyRoom): boolean {
    let data: unknown = null;
    try {
      const match: LobbyMatch<D> = { id, mode, players: players as LobbyMatch<D>['players'] };
      if (from) {
        match.room = from.id;
        match.settings = from.settings;
      }
      data = this.options.onStart?.(match) ?? null;
    } catch (err) {
      for (const p of players) {
        const member = this.members.get(p.id);
        if (member) member.match = null;
        this.send(p.id, { t: 'match/cancelled', match: id, reason: 'left', requeued: !from });
        if (from) this.send(p.id, { t: 'lobby/error', code: 'bad-request', message: err instanceof Error ? err.message : 'could not start' });
      }
      return false;
    }
    if (rooms.length) this.playing.set(id, rooms.map((r) => r.id));
    for (const p of players) {
      const member = this.members.get(p.id);
      if (member) member.match = null;
      const mine = typeof data === 'function' ? (data as (id: number) => unknown)(p.id) : data;
      this.send(p.id, { t: 'match/start', match: id, mode, players, data: mine });
    }
    return true;
  }

  /** A ready check failed: whoever did not accept is locked out, every group that did goes back to its place. */
  private cancel(p: Pending, reason: 'declined' | 'timeout' | 'left'): void {
    this.pending.delete(p.id);
    const now = this.now();
    const lockMs = this.options.declineLockMs ?? 30_000;
    // on a decline only the decliners are to blame; on a lapse, everyone who had not accepted
    const blamed = new Set<number>(reason === 'timeout' ? p.players.map((pl) => pl.id).filter((id) => !p.accepted.has(id)) : p.declined);
    for (const t of p.found.tickets) {
      const guilty = t.members.some((id) => blamed.has(id) || !this.members.has(id));
      if (guilty) {
        for (const id of t.members) {
          const member = this.members.get(id);
          if (!member) continue;
          member.match = null;
          if (blamed.has(id)) member.lockedUntil = now + lockMs;
          if (blamed.has(id)) this.send(id, { t: 'queue/locked', until: member.lockedUntil });
          this.send(id, { t: 'match/cancelled', match: p.id, reason, requeued: false });
        }
        if (t.id.startsWith('r:')) {
          const room = this.rooms.get(t.id.slice(2));
          if (room) {
            room.queued = false;
            this.pushRoom(room);
            this.listDirty = true;
          }
        }
        continue;
      }
      this.requeue(t);
      for (const id of t.members) this.send(id, { t: 'match/cancelled', match: p.id, reason, requeued: true });
    }
  }

  /** Back into the queue at its old place (its old `since`). */
  private requeue(t: Ticket): void {
    this.matchmaker.add(t);
    for (const id of t.members) {
      const member = this.members.get(id);
      if (member) {
        member.match = null;
        member.ticket = t.id;
      }
    }
    this.pushQueue(t);
  }

  private cancelPendingFor(id: number, reason: 'left'): void {
    const m = this.members.get(id);
    const p = m?.match ? this.pending.get(m.match) : undefined;
    if (!p) return;
    p.declined.add(id);
    this.cancel(p, reason);
  }

  // ── rooms ────────────────────────────────────────────────────────────────────────────────────────────────────

  private leaveRoom(m: Member<D>): void {
    const room = this.rooms.of(m.id);
    if (!room) return;
    if (room.queued) this.dequeueRoom(room);
    const left = this.rooms.leave(m.id);
    this.send(m.id, { t: 'lobby/room', room: null });
    if (left && !left.closed) this.pushRoom(left.room);
    this.listDirty = true;
  }

  private pushRoom(room: LobbyRoom): void {
    if (!this.rooms.get(room.id)) return;
    const state = this.rooms.state(room, (id) => this.members.get(id)?.data);
    for (const id of room.members) this.send(id, { t: 'lobby/room', room: state });
  }

  /** The list, to everyone browsing (in no room). */
  private pushList(): void {
    this.listDirty = false;
    const rooms = this.rooms.listed(this.options.listLimit ?? 50);
    for (const id of this.members.keys()) if (!this.rooms.of(id)) this.send(id, { t: 'lobby/rooms', rooms });
  }

  private error(m: Member<D>, code: LobbyErrorCode, message: string): void {
    this.send(m.id, { t: 'lobby/error', code, message });
  }

  /** A per-second allowance; three times over closes the socket. */
  private allow(m: Member<D>): boolean {
    const now = this.now();
    if (now - m.rateWindow >= 1000) {
      m.rateWindow = now;
      m.rateCount = 0;
    }
    const limit = this.options.ratePerSecond ?? 20;
    if (++m.rateCount <= limit) return true;
    if (m.rateCount === limit + 1) this.error(m, 'rate', 'Slow down');
    if (m.rateCount > limit * 3) {
      this.sockets.get(m.id)?.close(4008, 'too many messages');
      this.disconnect(m.id);
    }
    return false;
  }
}
