import { easeByName, type EaseFn } from './eases';
import { placeAt, type PlaceContext, type TimelinePosition } from './timelinePlace';
import { TimelineChild, type NestedPlay } from './TimelineChild';
import type { TweenTarget } from './Tweener';

/** A number to tween to, or `{ from, to }` to start from a given value instead of the target's own. */
export type TimelineProps = Record<string, number | { from?: number; to: number }>;

export interface TimelineTweenOptions {
  /** Ms (default 1000, as `Tweener`'s). */
  duration?: number;
  /** A name `easeByName` knows ('Quad.Out' when left out, as `Tweener`'s) or an ease function. */
  ease?: string | EaseFn;
  at?: TimelinePosition;
}

/**
 * The building half of `Timeline`: where each tween, call, gap and nested timeline goes. Kept apart from the playing
 * half so each stays readable; nothing here runs per frame.
 */
export abstract class TimelineBuilder {
  /** Sorted by start; equal starts keep the order they were added in. */
  protected readonly children: TimelineChild[] = [];
  protected readonly labels = new Map<string, number>();
  /** The longest child's end, kept as children are added rather than summed every frame. */
  private length = 0;
  private lastStart = 0;
  private lastEnd = 0;
  private group: { start: number; end: number } | null = null;

  /** Checks `child` may be played by this timeline and takes it over (it stops being stepped alone). */
  protected abstract adopt(child: TimelineBuilder): NestedPlay;

  /** One play, ms (the longest child's end). */
  get duration(): number {
    return this.length;
  }

  /** Tweens the numeric `props` of `targets` (one object or several), after what came before unless `at` says. */
  to(targets: object | readonly object[], props: TimelineProps, options: TimelineTweenOptions = {}): this {
    const list = (Array.isArray(targets) ? [...targets] : [targets]) as TweenTarget[];
    const names: string[] = [];
    const ends: number[] = [];
    const froms: (number | undefined)[] = [];
    for (const [name, v] of Object.entries(props)) {
      names.push(name);
      if (typeof v === 'number') {
        ends.push(v);
        froms.push(undefined);
      } else {
        ends.push(v.to);
        froms.push(v.from);
      }
    }
    const ease = typeof options.ease === 'function' ? options.ease : easeByName(options.ease);
    const duration = Math.max(0, options.duration ?? 1000);
    const start = this.place(options.at);
    return this.insert(new TimelineChild('tween', start, duration, list, names, ends, froms, ease));
  }

  /** Calls `fn` when the playhead passes `at` (default: the end so far), going either way. */
  call(fn: () => void, at?: TimelinePosition): this {
    return this.insert(new TimelineChild('call', this.place(at), 0, [], [], [], [], null, fn));
  }

  /** `ms` of nothing: the next child starts that much later, and a wait at the end makes the timeline longer. */
  wait(ms: number): this {
    return this.insert(new TimelineChild('gap', this.place(undefined), Math.max(0, ms)));
  }

  /** Names a point (default: the end so far), for positions and `seek`. */
  label(name: string, at?: TimelinePosition): this {
    this.labels.set(name, this.place(at));
    return this;
  }

  /** Where a label stands, if it is set. */
  labelTime(name: string): number | undefined {
    return this.labels.get(name);
  }

  /**
   * Everything `build` adds starts together, at `at` (default: the end so far); a position inside is measured from
   * the group's start. What follows the group starts at its longest child's end.
   */
  parallel(build: (timeline: this) => void, at?: TimelinePosition): this {
    const outer = this.group;
    const start = this.place(at);
    const group = { start, end: start };
    this.group = group;
    try {
      build(this);
    } finally {
      this.group = outer;
      if (outer) outer.end = Math.max(outer.end, group.end);
      this.lastStart = start;
      this.lastEnd = group.end;
    }
    return this;
  }

  /** Plays another timeline (built, not repeating forever) as one child of this one; it is no longer stepped alone. */
  add(child: TimelineBuilder, at?: TimelinePosition): this {
    const nested = this.adopt(child);
    const start = this.place(at);
    return this.insert(new TimelineChild('nested', start, nested.totalDuration, [], [], [], [], null, null, nested));
  }

  private place(at: TimelinePosition | undefined): number {
    const end = this.length;
    const ctx: PlaceContext = { fallback: this.group ? this.group.start : end, end, lastStart: this.lastStart, lastEnd: this.lastEnd, labels: this.labels };
    return placeAt(at, ctx);
  }

  private insert(child: TimelineChild): this {
    let i = this.children.length;
    while (i > 0 && this.children[i - 1]!.start > child.start) i--;
    this.children.splice(i, 0, child);
    this.length = Math.max(this.length, child.end);
    this.lastStart = child.start;
    this.lastEnd = child.end;
    if (this.group) this.group.end = Math.max(this.group.end, child.end);
    return this;
  }
}
