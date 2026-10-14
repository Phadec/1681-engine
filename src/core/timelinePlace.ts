/**
 * Where a child goes on a timeline: a time in ms from its start, or a string —
 * `'<'` the start of the child added last, `'>'` its end, `'+=200'` / `'-=100'` 200 ms after / 100 ms before the
 * default place (the timeline's end, or a `parallel` group's start), `'intro'` a label, and any of `'<'`, `'>'` or a
 * label followed by `+=n` / `-=n`. A string of digits is a time.
 */
export type TimelinePosition = number | string;

/** What a position is measured against; `labels` is written to when a position names a label not yet set. */
export interface PlaceContext {
  /** Where a child goes when no position is given: the timeline's end, or the open `parallel` group's start. */
  fallback: number;
  /** The end of the timeline as built so far: where a label first named in a position is set. */
  end: number;
  lastStart: number;
  lastEnd: number;
  labels: Map<string, number>;
}

const SHAPE = /^(.*?)(?:([+-])=(\d+(?:\.\d+)?))?$/;
const DIGITS = /^\d+(?:\.\d+)?$/;

/**
 * The start time (ms, never below 0) `at` names. A label not set yet is set at the timeline's end, the way GSAP does,
 * so `to(a, …, { at: 'hit' })` both places the child and names the spot for the children after it.
 */
export function placeAt(at: TimelinePosition | undefined, ctx: PlaceContext): number {
  if (at === undefined) return ctx.fallback;
  if (typeof at === 'number') return Math.max(0, at);
  const text = at.trim();
  if (DIGITS.test(text)) return Number(text);
  const m = SHAPE.exec(text);
  // the pattern matches any string (both parts may be empty), so this is only for the type checker
  if (!m) return ctx.fallback;
  const anchor = m[1] ?? '';
  let base: number;
  if (anchor === '') base = ctx.fallback;
  else if (anchor === '<') base = ctx.lastStart;
  else if (anchor === '>') base = ctx.lastEnd;
  else {
    const label = ctx.labels.get(anchor);
    if (label === undefined) {
      ctx.labels.set(anchor, ctx.end);
      base = ctx.end;
    } else base = label;
  }
  const amount = m[3] === undefined ? 0 : Number(m[3]) * (m[2] === '-' ? -1 : 1);
  return Math.max(0, base + amount);
}
