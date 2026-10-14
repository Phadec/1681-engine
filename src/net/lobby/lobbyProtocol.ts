/*
 * The lobby's messages: JSON, beside the netcode's own (`protocol.ts`). Names are `lobby/…`, `queue/…` and `match/…`,
 * so a game's own messages never collide with them.
 */

/** A lobby room as everyone browsing sees it. */
export interface RoomSummary {
  id: string;
  name: string;
  mode: string;
  players: number;
  maxPlayers: number;
  /** Joined only by its code. Private rooms are never listed; this is set on your own room's state. */
  private: boolean;
  /** The room is in the matchmaking queue or its game has started: nobody joins. */
  busy: boolean;
}

export interface RoomMember {
  id: number;
  /** The game's own public data for the player (a name, a look), as `admit` returned it. */
  data: unknown;
  ready: boolean;
}

/** Your own room, whole. */
export interface RoomState extends RoomSummary {
  /** The code a friend joins a private room by. */
  code: string;
  host: number;
  members: RoomMember[];
  /** The game's own settings for it (a map, a difficulty); only the host changes them. */
  settings: unknown;
  /** In the matchmaking queue as one group. */
  queued: boolean;
}

export interface MatchPlayer {
  id: number;
  data: unknown;
  team: number;
}

/** Client → lobby. */
export type LobbyClientMessage =
  | { t: 'lobby/list' }
  | { t: 'lobby/create'; name?: string; mode?: string; maxPlayers?: number; private?: boolean; settings?: unknown }
  | { t: 'lobby/join'; room?: string; code?: string }
  | { t: 'lobby/leave' }
  | { t: 'lobby/ready'; ready: boolean }
  | { t: 'lobby/kick'; player: number }
  | { t: 'lobby/promote'; player: number }
  | { t: 'lobby/settings'; settings: unknown }
  | { t: 'lobby/chat'; text: string }
  /** The host starts the room's own game (everyone ready), outside matchmaking. */
  | { t: 'lobby/start' }
  /** Queue alone, or the whole room when its host asks. */
  | { t: 'queue/join'; mode: string }
  | { t: 'queue/leave' }
  | { t: 'match/accept' }
  | { t: 'match/decline' };

/** Why the lobby refused something. */
export type LobbyErrorCode =
  | 'bad-request'
  | 'no-room'
  | 'room-full'
  | 'room-busy'
  | 'not-host'
  | 'not-ready'
  | 'in-room'
  | 'not-in-room'
  | 'no-mode'
  | 'too-many'
  | 'queued'
  | 'locked'
  | 'rate';

/** Lobby → client. */
export type LobbyServerMessage =
  | { t: 'lobby/welcome'; id: number; modes: string[] }
  | { t: 'lobby/rooms'; rooms: RoomSummary[] }
  /** Your room changed (null: you are in none). */
  | { t: 'lobby/room'; room: RoomState | null }
  | { t: 'lobby/chat'; from: number; text: string }
  | { t: 'lobby/kicked' }
  | { t: 'lobby/error'; code: LobbyErrorCode; message: string }
  /** In the queue since `since` (server ms), `waiting` other groups queued for that mode; `until` set while locked out. */
  | { t: 'queue/status'; mode: string | null; since: number; waiting: number }
  | { t: 'queue/locked'; until: number }
  | { t: 'match/found'; match: string; mode: string; players: MatchPlayer[]; expiresAt: number }
  | { t: 'match/accepted'; match: string; accepted: number[] }
  /** The ready check failed; `requeued` when you were put back in the queue at your old place. */
  | { t: 'match/cancelled'; match: string; reason: 'declined' | 'timeout' | 'left'; requeued: boolean }
  /** Everyone accepted (or the host started the room): go play. `data` is what the game's `onStart` returned for you. */
  | { t: 'match/start'; match: string; mode: string; players: MatchPlayer[]; data: unknown };
