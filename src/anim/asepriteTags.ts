import type { AsepriteDirection } from './asepriteTypes';

const DIRECTIONS: readonly AsepriteDirection[] = ['forward', 'reverse', 'pingpong', 'pingpong_reverse'];

/** Aseprite's direction name, or forward for anything unknown (older files write none). */
export function tagDirection(raw: string | undefined): AsepriteDirection {
  return DIRECTIONS.includes(raw as AsepriteDirection) ? (raw as AsepriteDirection) : 'forward';
}

/** Aseprite writes the repeat count as a string; absent, 0 or nonsense is forever. */
export function tagRepeat(raw: string | number | undefined): number {
  const n = typeof raw === 'number' ? raw : raw === undefined ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * The sheet frames a tag plays, in playing order, unrolled so the engine's `Animator` (which only ever plays a list
 * forward) shows exactly what Aseprite's own player shows.
 *
 * - forever (`repeat` 0): forward and reverse are one pass, looped; a ping-pong is one round trip without its two
 *   ends doubled (a b c d c b, then a again), so a loop never stutters on the turn.
 * - `repeat` n: n passes, played once. A ping-pong counts each pass in one direction as one, as Aseprite does, and two
 *   passes share their turning frame (repeat 2 of a b c is a b c b a).
 */
export function tagFrames(from: number, to: number, direction: AsepriteDirection, repeat: number): number[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const up: number[] = [];
  for (let i = lo; i <= hi; i++) up.push(i);
  const down = up.slice().reverse();
  const backward = direction === 'reverse' || direction === 'pingpong_reverse';
  const first = backward ? down : up;
  const pingpong = direction === 'pingpong' || direction === 'pingpong_reverse';

  if (repeat === 0) {
    if (!pingpong || up.length <= 2) return first;
    const second = backward ? up : down;
    return first.concat(second.slice(1, -1));
  }
  if (!pingpong) {
    const out: number[] = [];
    for (let r = 0; r < repeat; r++) out.push(...first);
    return out;
  }
  const out = first.slice();
  for (let r = 1; r < repeat; r++) {
    const pass = r % 2 === 0 ? first : backward ? up : down;
    // the turning frame closes one pass and opens the next: shown once, as Aseprite shows it
    out.push(...(up.length > 1 ? pass.slice(1) : pass));
  }
  return out;
}
