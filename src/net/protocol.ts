import type { EntityUpdate, InputStep } from './constants';
import type { MoverState } from './movement';

/*
 * The engine's netcode messages. JSON, but for snapshots that carry body updates, which travel as one binary frame
 * (`encodeSnapshotFrame`). A game adds its own messages beside these: anything with a `t` the engine does not know
 * is handed to the game untouched.
 */

/** Client → server. */
export type ClientMessage =
  /** Asks to join; `data` is the game's own (a name, a character). */
  | { t: 'hello'; data?: unknown }
  /** Input steps `seq`, `seq + 1`, … taken since the last send. */
  | { t: 'input'; seq: number; steps: InputStep[] }
  /** A ping carrying the client's own clock, answered by a pong. */
  | { t: 'ping'; c: number };

/** Server → client. */
export type ServerMessage =
  | { t: 'welcome'; id: number; tick: number; stepRate: number; snapRate: number }
  | { t: 'pong'; c: number; st: number }
  | Snapshot;

/** A body's whole mover, so a client can rewind to it exactly: x, y, lastDx, lastDy, dashLeft, dashCd, dashDx, dashDy. */
export type MoverWire = [number, number, number, number, number, number, number, number];

/** A body coming into view: its id and the game's own description of it (what it looks like). */
export interface SpawnInfo {
  id: number;
  data?: unknown;
}

export interface Snapshot {
  t: 'snap';
  /** The server's step count when it was taken. */
  tick: number;
  /** The server's wall time when it was taken (ms since the epoch), for interpolation. */
  time: number;
  /** The last input step of this client the server has applied (-1 before any). */
  ack: number;
  /** This client's own body, whole, as of `ack`. */
  me?: MoverWire;
  /** Bodies that came into view. */
  sp?: SpawnInfo[];
  /** Bodies that left view. */
  rm?: number[];
  /** Every body in view: [id, x, y, aim, anim, hp, flags]. */
  up?: EntityUpdate[];
}

export function moverToWire(m: MoverState): MoverWire {
  return [m.x, m.y, m.lastDx, m.lastDy, m.dashLeft, m.dashCd, m.dashDx, m.dashDy];
}

export function moverFromWire(w: MoverWire, into: MoverState): MoverState {
  [into.x, into.y, into.lastDx, into.lastDy, into.dashLeft, into.dashCd, into.dashDx, into.dashDy] = w;
  return into;
}
