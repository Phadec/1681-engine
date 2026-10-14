import type { EntityUpdate, InputStep, MovementParams } from './constants';
import { LagCompensator } from './LagCompensator';
import { createMover, stepMover, type CollisionGrid, type MoverState } from './movement';
import { moverToWire, type Snapshot } from './protocol';
import { SpatialHash } from './SpatialHash';

export interface RoomPlayer<D = unknown> {
  readonly id: number;
  readonly mover: MoverState;
  /** The game's own data for this player (sent to others in `sp` when they first see it). */
  data: D;
  params: MovementParams;
  /** The last input step applied (-1 before any): what snapshots acknowledge. */
  ack: number;
  /** Steps received and not yet applied. */
  readonly queue: InputStep[];
  /** What the snapshot's update record carries beside the position; the game sets them. */
  aim: number;
  anim: number;
  hp: number;
  flags: number;
  /** Refused inputs (nonsense numbers, a flood): a game may kick past some count. */
  strikes: number;
}

/** Who a player is sent: the bodies near it, not the whole room. */
export interface RoomInterest<D> {
  /** A body comes into view within this many px of the player (centre to centre). */
  radius: number;
  /**
   * And leaves only past `radius + leaveMargin` (default a quarter of `radius`), so a body walking along the edge is
   * not spawned and removed on every snapshot.
   */
  leaveMargin?: number;
  /** A further test, for what distance alone does not decide (a team's own always, a hidden enemy never). */
  canSee?: (viewer: RoomPlayer<D>, other: RoomPlayer<D>) => boolean;
}

export interface RoomOptions<D> {
  grid: CollisionGrid;
  /** Movement rules a new player starts with. */
  params: MovementParams;
  /** Where a player who joins stands. */
  spawn: (id: number, data: D) => { x: number; y: number };
  /** Steps a player may have waiting before more are refused (default 30: half a second at 60). */
  maxQueue?: number;
  /** A player with more than `backlog` waiting catches up by running up to `maxStepsPerTick` a tick (default 3, 4). */
  maxStepsPerTick?: number;
  backlog?: number;
  /** Called after each step a player takes (set aim, anim, flags from it). */
  onStep?: (player: RoomPlayer<D>, step: InputStep) => void;
  /** Send each player only the bodies near it (default: everyone to everyone). */
  interest?: RoomInterest<D>;
  /**
   * Keep this many ms of positions for lag compensation (`history`), recorded as each round of snapshots goes out
   * (`record`). Off by default.
   */
  rewindMs?: number;
}

/**
 * An authoritative room for a server: players send input steps, the room applies them with the same `stepMover` the
 * clients predict with, and builds each player a snapshot of everyone (with their own body whole, so their
 * prediction can rewind to it). Transport-free: wire `input`, `step` and `snapshotFor` to any socket library.
 *
 * Every step a player sends is applied once, in order; a client cannot move faster by sending more (the queue is
 * capped and drained at most `maxStepsPerTick` a tick), and nonsense input is refused and counted.
 */
export class Room<D = unknown> {
  readonly players = new Map<number, RoomPlayer<D>>();
  tick = 0;
  /** Past positions for judging shots against what a client saw, when the room was made with `rewindMs`. */
  readonly history: LagCompensator | null;
  /** How far back a client's claimed view time is honoured (`rewindMs`, 0 when off). */
  readonly rewindMs: number;
  private readonly known = new Map<number, Set<number>>();
  private readonly hash: SpatialHash | null;
  private readonly nearby: number[] = [];
  private readonly maxQueue: number;
  private readonly maxSteps: number;
  private readonly backlog: number;

  constructor(private readonly options: RoomOptions<D>) {
    this.maxQueue = options.maxQueue ?? 30;
    this.maxSteps = options.maxStepsPerTick ?? 3;
    this.backlog = options.backlog ?? 4;
    const interest = options.interest;
    if (interest && !(interest.radius > 0)) throw new Error(`Room: interest.radius must be above 0 (got ${interest.radius})`);
    this.hash = interest ? new SpatialHash(interest.radius) : null;
    this.rewindMs = Math.max(0, options.rewindMs ?? 0);
    // a snapshot interval or two beyond the longest rewind, so a rewind to its limit still has a frame either side
    this.history = this.rewindMs > 0 ? new LagCompensator(this.rewindMs + 200) : null;
  }

  join(id: number, data: D): RoomPlayer<D> {
    if (this.players.has(id)) throw new Error(`Room: player ${id} has already joined`);
    const at = this.options.spawn(id, data);
    const player: RoomPlayer<D> = {
      id,
      mover: createMover(at.x, at.y),
      data,
      params: { ...this.options.params },
      ack: -1,
      queue: [],
      aim: 0,
      anim: 0,
      hp: 0,
      flags: 0,
      strikes: 0,
    };
    this.players.set(id, player);
    this.known.set(id, new Set());
    this.hash?.set(id, at.x, at.y);
    return player;
  }

  leave(id: number): void {
    this.players.delete(id);
    this.known.delete(id);
    this.hash?.delete(id);
    this.history?.forget(id);
  }

  /**
   * Records where every body is now, at server time `time`, into `history`; `RoomHost` calls it as each round of
   * snapshots goes out, so the history holds exactly the positions clients interpolate between.
   */
  record(time: number): void {
    this.history?.record(time, [...this.players.values()].map((p) => ({ id: p.id, x: p.mover.x, y: p.mover.y })));
  }

  /**
   * Input steps `seq`, `seq + 1`, … from a player. Steps already received are skipped (a resend), any step with
   * numbers no client sends refuses the whole message, and steps past a full queue are dropped. Returns false when
   * something was refused.
   */
  input(id: number, seq: number, steps: readonly InputStep[]): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    if (!Number.isInteger(seq) || seq < 0 || !Array.isArray(steps) || steps.length > this.maxQueue) {
      p.strikes++;
      return false;
    }
    for (const s of steps) {
      if (!Array.isArray(s) || s.length !== 3 || !s.every((v) => Number.isFinite(v)) || Math.abs(s[0]) > 1 || Math.abs(s[1]) > 1 || !Number.isInteger(s[2])) {
        p.strikes++;
        return false;
      }
    }
    const next = p.ack + 1 + p.queue.length;
    // a gap (steps this room refused earlier) is filled with standing still, so sequence numbers stay the client's
    const gap = seq - next;
    if (gap > this.maxQueue) {
      p.strikes++;
      return false;
    }
    for (let i = 0; i < gap; i++) p.queue.push([0, 0, 0]);
    let ok = true;
    for (let i = 0; i < steps.length; i++) {
      if (seq + i < next) continue; // already have it: a resend
      if (p.queue.length >= this.maxQueue) {
        ok = false;
        p.strikes++;
        break;
      }
      p.queue.push([steps[i]![0], steps[i]![1], steps[i]![2]]);
    }
    return ok;
  }

  /** One simulation step for everyone. */
  step(): void {
    this.tick++;
    for (const p of this.players.values()) {
      const waiting = p.queue.length;
      const n = waiting > this.backlog ? Math.min(this.maxSteps, waiting - this.backlog + 1) : Math.min(1, waiting);
      for (let i = 0; i < n; i++) {
        const s = p.queue.shift()!;
        stepMover(p.mover, s, p.params, this.options.grid);
        p.ack++;
        this.options.onStep?.(p, s);
      }
      // every body, moved by a step or by the game's own hand (a teleport): a write when it stays in its cell
      this.hash?.set(p.id, p.mover.x, p.mover.y);
    }
  }

  /**
   * Moves a player by hand (a teleport, a respawn), and files it in the interest grid at once. Writing `mover.x/y`
   * directly also works; the room then finds it at its new place from the next step.
   */
  place(id: number, x: number, y: number): void {
    const p = this.players.get(id);
    if (!p) return;
    p.mover.x = x;
    p.mover.y = y;
    this.hash?.set(id, x, y);
  }

  /** The snapshot player `id` should get now. `time` is the server's wall clock (ms). */
  snapshotFor(id: number, time: number): Snapshot | null {
    const me = this.players.get(id);
    const known = this.known.get(id);
    if (!me || !known) return null;
    const up: EntityUpdate[] = [];
    const sp: { id: number; data?: unknown }[] = [];
    const seen = new Set<number>();
    for (const p of this.visibleTo(me, known)) {
      seen.add(p.id);
      up.push([p.id, p.mover.x, p.mover.y, p.aim, p.anim, p.hp, p.flags]);
      if (!known.has(p.id)) {
        known.add(p.id);
        sp.push({ id: p.id, data: p.data });
      }
    }
    const rm: number[] = [];
    for (const k of known) {
      if (!seen.has(k)) {
        known.delete(k);
        rm.push(k);
      }
    }
    const snap: Snapshot = { t: 'snap', tick: this.tick, time, ack: me.ack, me: moverToWire(me.mover), up };
    if (sp.length) snap.sp = sp;
    if (rm.length) snap.rm = rm;
    return snap;
  }

  /** The players `me` is sent: itself always; with interest, the others in range (a known one until past the margin). */
  private visibleTo(me: RoomPlayer<D>, known: ReadonlySet<number>): Iterable<RoomPlayer<D>> {
    const interest = this.options.interest;
    if (!interest || !this.hash) return this.players.values();
    const enter = interest.radius;
    const leave = enter + (interest.leaveMargin ?? enter / 4);
    const near = this.nearby;
    near.length = 0;
    this.hash.near(me.mover.x, me.mover.y, leave, near);
    const out: RoomPlayer<D>[] = [me];
    for (const id of near) {
      if (id === me.id) continue;
      const p = this.players.get(id);
      if (!p) continue;
      const d2 = (p.mover.x - me.mover.x) ** 2 + (p.mover.y - me.mover.y) ** 2;
      if (d2 > enter * enter && !known.has(id)) continue;
      if (interest.canSee && !interest.canSee(me, p)) continue;
      out.push(p);
    }
    // the same order every time, whatever order the cells were walked in
    return out.sort((a, b) => a.id - b.id);
  }
}
