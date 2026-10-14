import type { RoomMember, RoomState, RoomSummary } from './lobbyProtocol';

/** A lobby room on the server. */
export interface LobbyRoom {
  readonly id: string;
  readonly code: string;
  name: string;
  mode: string;
  maxPlayers: number;
  private: boolean;
  host: number;
  /** In the order they came: the next host is the first left. */
  readonly members: number[];
  readonly ready: Set<number>;
  settings: unknown;
  /** In the matchmaking queue as one group. */
  queued: boolean;
  /** Its game is being played (or its match is being accepted): nobody joins until `LobbyHost.finish`. */
  playing: boolean;
}

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * The rooms of a lobby and who is in which, with no sockets: create, join by id or code, leave (the host's place
 * passing to the next member, an empty room closing), kick, ready. `LobbyHost` speaks for it.
 */
export class LobbyRooms {
  private readonly rooms = new Map<string, LobbyRoom>();
  private readonly byCode = new Map<string, LobbyRoom>();
  private readonly roomOf = new Map<number, LobbyRoom>();
  private nextId = 1;

  constructor(private readonly random: () => number = Math.random) {}

  get count(): number {
    return this.rooms.size;
  }

  get(id: string): LobbyRoom | undefined {
    return this.rooms.get(id);
  }

  byInvite(code: string): LobbyRoom | undefined {
    return this.byCode.get(code.toUpperCase());
  }

  of(player: number): LobbyRoom | undefined {
    return this.roomOf.get(player);
  }

  all(): IterableIterator<LobbyRoom> {
    return this.rooms.values();
  }

  create(host: number, o: { name: string; mode: string; maxPlayers: number; private: boolean; settings: unknown }): LobbyRoom {
    if (this.roomOf.has(host)) throw new Error('LobbyRooms: already in a room');
    let code = '';
    do code = Array.from({ length: 6 }, () => CODE_LETTERS[Math.floor(this.random() * CODE_LETTERS.length)]).join('');
    while (this.byCode.has(code));
    const room: LobbyRoom = { id: `R${this.nextId++}`, code, ...o, host, members: [host], ready: new Set(), queued: false, playing: false };
    this.rooms.set(room.id, room);
    this.byCode.set(code, room);
    this.roomOf.set(host, room);
    return room;
  }

  join(player: number, room: LobbyRoom): void {
    if (this.roomOf.has(player)) throw new Error('LobbyRooms: already in a room');
    room.members.push(player);
    this.roomOf.set(player, room);
  }

  /** Takes a player out of their room; returns the room (closed when it emptied, `closed` true). */
  leave(player: number): { room: LobbyRoom; closed: boolean } | null {
    const room = this.roomOf.get(player);
    if (!room) return null;
    this.roomOf.delete(player);
    const i = room.members.indexOf(player);
    if (i >= 0) room.members.splice(i, 1);
    room.ready.delete(player);
    if (room.members.length === 0) {
      this.rooms.delete(room.id);
      this.byCode.delete(room.code);
      return { room, closed: true };
    }
    if (room.host === player) {
      room.host = room.members[0]!;
      // a new host is not waiting on itself
      room.ready.delete(room.host);
    }
    return { room, closed: false };
  }

  /** Everyone but the host has said they are ready. */
  allReady(room: LobbyRoom): boolean {
    return room.members.every((m) => m === room.host || room.ready.has(m));
  }

  summary(room: LobbyRoom): RoomSummary {
    return { id: room.id, name: room.name, mode: room.mode, players: room.members.length, maxPlayers: room.maxPlayers, private: room.private, busy: room.queued || room.playing };
  }

  state(room: LobbyRoom, dataOf: (id: number) => unknown): RoomState {
    const members: RoomMember[] = room.members.map((id) => ({ id, data: dataOf(id), ready: id === room.host || room.ready.has(id) }));
    return { ...this.summary(room), code: room.code, host: room.host, members, settings: room.settings, queued: room.queued };
  }

  /** The rooms anyone may browse: public, open, not full; the fullest first, so players gather. */
  listed(limit: number): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((r) => !r.private && !r.queued && !r.playing && r.members.length < r.maxPlayers)
      .sort((a, b) => b.members.length - a.members.length || (a.id < b.id ? -1 : 1))
      .slice(0, limit)
      .map((r) => this.summary(r));
  }
}
