import { EventBus } from '../../events/EventBus';
import type { LobbyClientMessage, LobbyErrorCode, LobbyServerMessage, MatchPlayer, RoomState, RoomSummary } from './lobbyProtocol';

/** What a `LobbyClient` sends through and hears from: a `Connection` fits. */
export interface LobbyLink {
  send(msg: { t: string; [k: string]: unknown }): void;
  readonly events: { on(event: 'message', fn: (msg: { t: string; [k: string]: unknown }) => void): () => void };
}

export interface PendingMatch {
  id: string;
  mode: string;
  players: MatchPlayer[];
  expiresAt: number;
  accepted: number[];
  /** You answered already. */
  answered: boolean;
}

export interface LobbyClientEvents {
  /** Anything in the client's state changed: redraw the lobby screen. */
  change: undefined;
  chat: { from: number; text: string };
  error: { code: LobbyErrorCode; message: string };
  kicked: undefined;
  found: PendingMatch;
  cancelled: { match: string; reason: 'declined' | 'timeout' | 'left'; requeued: boolean };
  /** Go and play: `data` is what the server's `onStart` gave you. */
  start: { match: string; mode: string; players: MatchPlayer[]; data: unknown };
}

/**
 * The lobby as a client sees it: the room list, your room, your place in the queue and a match waiting for your
 * answer, kept up to date from the server's messages, with a method for everything a lobby screen does. Hand it the
 * game's `Connection` (or anything that sends JSON and emits the messages it does not handle):
 *
 * ```ts
 * const conn = new Connection('wss://lobby.example.com', { hello: () => ({ name }) }).connect();
 * const lobby = new LobbyClient(conn);
 * lobby.events.on('change', () => drawLobby(lobby));
 * lobby.events.on('start', ({ data }) => joinGame(data));
 * lobby.queue('duel');
 * ```
 */
export class LobbyClient {
  readonly events = new EventBus<LobbyClientEvents>();
  /** Your id in the lobby (-1 until welcomed). */
  id = -1;
  modes: string[] = [];
  rooms: RoomSummary[] = [];
  room: RoomState | null = null;
  /** Your queue: the mode, since when (server ms) and how many other groups wait for it. */
  queued: { mode: string; since: number; waiting: number } | null = null;
  /** Kept out of the queue until then (server ms), after a declined match. */
  lockedUntil = 0;
  match: PendingMatch | null = null;
  private readonly off: () => void;

  constructor(private readonly link: LobbyLink) {
    this.off = link.events.on('message', (msg) => this.receive(msg as LobbyServerMessage));
  }

  get isHost(): boolean {
    return this.room !== null && this.room.host === this.id;
  }

  /** Every member of your room but the host has said ready. */
  get roomReady(): boolean {
    return this.room !== null && this.room.members.every((m) => m.ready);
  }

  list(): void {
    this.send({ t: 'lobby/list' });
  }
  create(options: Omit<Extract<LobbyClientMessage, { t: 'lobby/create' }>, 't'> = {}): void {
    this.send({ t: 'lobby/create', ...options });
  }
  join(room: string): void {
    this.send({ t: 'lobby/join', room });
  }
  joinByCode(code: string): void {
    this.send({ t: 'lobby/join', code: code.trim().toUpperCase() });
  }
  leave(): void {
    this.send({ t: 'lobby/leave' });
  }
  setReady(ready: boolean): void {
    this.send({ t: 'lobby/ready', ready });
  }
  kick(player: number): void {
    this.send({ t: 'lobby/kick', player });
  }
  promote(player: number): void {
    this.send({ t: 'lobby/promote', player });
  }
  setSettings(settings: unknown): void {
    this.send({ t: 'lobby/settings', settings });
  }
  chat(text: string): void {
    this.send({ t: 'lobby/chat', text });
  }
  startRoom(): void {
    this.send({ t: 'lobby/start' });
  }
  queue(mode: string): void {
    this.send({ t: 'queue/join', mode });
  }
  leaveQueue(): void {
    this.send({ t: 'queue/leave' });
  }
  accept(): void {
    if (this.match) this.match.answered = true;
    this.send({ t: 'match/accept' });
    this.events.emit('change', undefined);
  }
  decline(): void {
    if (this.match) this.match.answered = true;
    this.send({ t: 'match/decline' });
  }

  destroy(): void {
    this.off();
    this.events.clear();
  }

  private send(msg: LobbyClientMessage): void {
    this.link.send(msg as unknown as { t: string; [k: string]: unknown });
  }

  private receive(msg: LobbyServerMessage): void {
    switch (msg.t) {
      case 'lobby/welcome':
        this.id = msg.id;
        this.modes = msg.modes;
        break;
      case 'lobby/rooms':
        this.rooms = msg.rooms;
        break;
      case 'lobby/room':
        this.room = msg.room;
        break;
      case 'lobby/chat':
        this.events.emit('chat', { from: msg.from, text: msg.text });
        return;
      case 'lobby/kicked':
        this.room = null;
        this.events.emit('kicked', undefined);
        break;
      case 'lobby/error':
        this.events.emit('error', { code: msg.code, message: msg.message });
        return;
      case 'queue/status':
        this.queued = msg.mode ? { mode: msg.mode, since: msg.since, waiting: msg.waiting } : null;
        break;
      case 'queue/locked':
        this.lockedUntil = msg.until;
        break;
      case 'match/found':
        this.queued = null;
        this.match = { id: msg.match, mode: msg.mode, players: msg.players, expiresAt: msg.expiresAt, accepted: [], answered: false };
        this.events.emit('found', this.match);
        break;
      case 'match/accepted':
        if (this.match?.id === msg.match) this.match.accepted = msg.accepted;
        break;
      case 'match/cancelled':
        if (this.match?.id === msg.match) this.match = null;
        this.events.emit('cancelled', { match: msg.match, reason: msg.reason, requeued: msg.requeued });
        break;
      case 'match/start':
        this.match = null;
        this.queued = null;
        this.events.emit('start', { match: msg.match, mode: msg.mode, players: msg.players, data: msg.data });
        break;
      default:
        return;
    }
    this.events.emit('change', undefined);
  }
}
