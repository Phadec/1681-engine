/** A mode the matchmaker fills: `teams` sides of `teamSize` players. */
export interface MatchMode {
  id: string;
  teams: number;
  teamSize: number;
  /** Rating difference allowed at once (default 100), widened by `widenPerSecond` (default 10) up to `maxWindow` (default 600). */
  window?: number;
  widenPerSecond?: number;
  maxWindow?: number;
}

/** One group waiting together: a player alone, or a party that must not be split. */
export interface Ticket {
  id: string;
  mode: string;
  members: readonly number[];
  /** The group's rating (the game's own: Elo, a level, a power score). */
  rating: number;
  /** When it joined the queue (ms): the oldest waits least. */
  since: number;
}

export interface FoundMatch {
  mode: string;
  tickets: Ticket[];
  /** Each team's player ids, in the order the teams are numbered. */
  teams: number[][];
}

/**
 * The matchmaking queue, pure: tickets in, matches out, no clock of its own and no sockets. Each `find(now)` takes
 * the oldest ticket of a mode as the anchor, gathers the groups within its rating window (and each within theirs,
 * so a newcomer is not thrown in with veterans because a veteran waited), and fills the teams from the closest
 * ratings first, never splitting a party; the teams are then balanced by rating. A window grows with the wait, so
 * anyone is matched in the end; a ticket nothing fits waits for the next call.
 */
export class Matchmaker {
  private readonly modes = new Map<string, MatchMode>();
  private readonly tickets = new Map<string, Ticket>();

  constructor(modes: readonly MatchMode[]) {
    for (const m of modes) {
      if (!(m.teams >= 1 && m.teamSize >= 1)) throw new Error(`Matchmaker: mode ${m.id} needs at least one team of one`);
      this.modes.set(m.id, m);
    }
  }

  get size(): number {
    return this.tickets.size;
  }

  mode(id: string): MatchMode | undefined {
    return this.modes.get(id);
  }

  /** Adds a ticket (replacing one of the same id); throws on an unknown mode or a group too big for a team. */
  add(ticket: Ticket): void {
    const m = this.modes.get(ticket.mode);
    if (!m) throw new Error(`Matchmaker: no mode ${ticket.mode}`);
    if (ticket.members.length < 1 || ticket.members.length > m.teamSize) throw new Error(`Matchmaker: a group of ${ticket.members.length} does not fit a team of ${m.teamSize}`);
    this.tickets.set(ticket.id, ticket);
  }

  remove(id: string): Ticket | undefined {
    const t = this.tickets.get(id);
    this.tickets.delete(id);
    return t;
  }

  get(id: string): Ticket | undefined {
    return this.tickets.get(id);
  }

  /** The tickets waiting for a mode, oldest first. */
  waiting(mode: string): Ticket[] {
    return [...this.tickets.values()].filter((t) => t.mode === mode).sort((a, b) => a.since - b.since);
  }

  /** How far a ticket's rating window reaches now. */
  windowOf(t: Ticket, now: number): number {
    const m = this.modes.get(t.mode)!;
    const waited = Math.max(0, now - t.since) / 1000;
    return Math.min(m.maxWindow ?? 600, (m.window ?? 100) + (m.widenPerSecond ?? 10) * waited);
  }

  /** Every match that can be made now; their tickets leave the queue. */
  find(now: number): FoundMatch[] {
    const out: FoundMatch[] = [];
    for (const mode of this.modes.values()) {
      const need = mode.teams * mode.teamSize;
      let progress = true;
      while (progress) {
        progress = false;
        const queue = this.waiting(mode.id);
        for (const anchor of queue) {
          const match = this.tryAnchor(anchor, queue, mode, need, now);
          if (!match) continue;
          for (const t of match.tickets) this.tickets.delete(t.id);
          out.push(match);
          progress = true;
          break;
        }
      }
    }
    return out;
  }

  private tryAnchor(anchor: Ticket, queue: Ticket[], mode: MatchMode, need: number, now: number): FoundMatch | null {
    const wa = this.windowOf(anchor, now);
    const near = queue
      .filter((t) => t !== anchor && Math.abs(t.rating - anchor.rating) <= Math.min(wa, this.windowOf(t, now)))
      .sort((a, b) => Math.abs(a.rating - anchor.rating) - Math.abs(b.rating - anchor.rating) || a.since - b.since);
    const picked = pickGroups([anchor], near, need);
    if (!picked) return null;
    const teams = balanceTeams(picked, mode.teams, mode.teamSize);
    if (!teams) return null;
    return { mode: mode.id, tickets: picked, teams };
  }
}

/** Groups from `pool` (closest first) added to `start` until they hold exactly `need` players; a small search, not greedy, so a party of three is not shut out by two singles taken first. */
function pickGroups(start: Ticket[], pool: Ticket[], need: number): Ticket[] | null {
  const have = start.reduce((n, t) => n + t.members.length, 0);
  if (have === need) return start;
  if (have > need) return null;
  const chosen: Ticket[] = [];
  let budget = 2000;
  const search = (from: number, left: number): boolean => {
    if (left === 0) return true;
    if (--budget < 0) return false;
    for (let i = from; i < pool.length; i++) {
      const t = pool[i]!;
      if (t.members.length > left) continue;
      chosen.push(t);
      if (search(i + 1, left - t.members.length)) return true;
      chosen.pop();
    }
    return false;
  };
  return search(0, need - have) ? [...start, ...chosen] : null;
}

/**
 * Splits groups into `teams` of exactly `size` players, parties whole, ratings as even as it can: the largest groups
 * first, each into the team with room whose rating total is lowest. Returns null when the sizes cannot be packed.
 */
export function balanceTeams(groups: readonly Ticket[], teams: number, size: number): number[][] | null {
  const sorted = [...groups].sort((a, b) => b.members.length - a.members.length || b.rating - a.rating);
  const sides = Array.from({ length: teams }, () => ({ ids: [] as number[], weight: 0 }));
  const place = (i: number): boolean => {
    if (i === sorted.length) return true;
    const g = sorted[i]!;
    const order = [...sides.keys()].sort((a, b) => sides[a]!.weight - sides[b]!.weight || sides[a]!.ids.length - sides[b]!.ids.length);
    for (const s of order) {
      const side = sides[s]!;
      if (side.ids.length + g.members.length > size) continue;
      side.ids.push(...g.members);
      side.weight += g.rating * g.members.length;
      if (place(i + 1)) return true;
      side.ids.length -= g.members.length;
      side.weight -= g.rating * g.members.length;
    }
    return false;
  };
  return place(0) ? sides.map((s) => s.ids) : null;
}
