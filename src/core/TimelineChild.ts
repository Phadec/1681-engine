import type { EaseFn } from './eases';
import type { TweenTarget } from './Tweener';
import { readProp, writeProp } from './tweenProps';

/** What a nested timeline offers the timeline playing it. */
export interface NestedPlay {
  readonly totalDuration: number;
  /** Plays from `from` to `to` (its own time, ms); `includeStart` fires a call standing exactly at `from`. */
  playNested(from: number, to: number, fire: boolean, includeStart: boolean): void;
}

export type ChildKind = 'tween' | 'call' | 'gap' | 'nested';

/**
 * One thing on a timeline: a tween, a call, an empty gap (`wait`) or a nested timeline, at `start` for `duration` ms.
 * A tween reads its start values the first time the playhead reaches it — not when it is added — so a tween that
 * follows another on the same property starts where that one ended, and keeps those values for seeking and reversing.
 */
export class TimelineChild {
  /** Every target × prop start value, captured once (`inited`). */
  private readonly froms: number[] = [];
  private inited = false;
  /** Progress (tween) or own time (nested) last written; NaN before the first, so the first always writes. */
  private last = Number.NaN;

  constructor(
    readonly kind: ChildKind,
    readonly start: number,
    readonly duration: number,
    readonly targets: readonly TweenTarget[] = [],
    private readonly props: readonly string[] = [],
    private readonly ends: readonly number[] = [],
    /** A start value given as `{ from, to }`, per prop; undefined reads the target's own. */
    private readonly givenFrom: readonly (number | undefined)[] = [],
    private readonly ease: EaseFn | null = null,
    private readonly fn: (() => void) | null = null,
    private readonly nested: NestedPlay | null = null,
  ) {}

  get end(): number {
    return this.start + this.duration;
  }

  /**
   * The playhead moved from `a` to `b` (the parent's own time, either way). Calls fire when `fire` is set and their
   * time lies in the span with its start left out and its end kept — so a call met at the end of one frame does not
   * fire again at the start of the next — unless `includeStart` keeps the start too (a run or a repeat beginning).
   */
  play(a: number, b: number, fire: boolean, includeStart: boolean): void {
    switch (this.kind) {
      case 'tween':
        this.playTween(b);
        break;
      case 'call':
        if (fire && this.fn && crossed(a, b, this.start, includeStart)) this.fn();
        break;
      case 'nested':
        this.playNested(a, b, fire, includeStart);
        break;
      case 'gap':
        break;
    }
  }

  private playTween(b: number): void {
    if (!this.inited) {
      if (b < this.start) return;
      this.capture();
    }
    let p: number;
    if (this.duration > 0) p = Math.min(1, Math.max(0, (b - this.start) / this.duration));
    else p = b >= this.start ? 1 : 0;
    if (p === this.last) return;
    this.last = p;
    const k = this.ease ? this.ease(p) : p;
    const props = this.props;
    const np = props.length;
    const targets = this.targets;
    for (let t = 0; t < targets.length; t++) {
      const target = targets[t]!;
      // a destroyed display object is skipped, as Tweener does: its owner freed it, nothing is left to move
      if (target.destroyed === true) continue;
      for (let i = 0; i < np; i++) {
        const from = this.froms[t * np + i]!;
        writeProp(target, props[i]!, from + (this.ends[i]! - from) * k);
      }
    }
  }

  private capture(): void {
    this.inited = true;
    const props = this.props;
    for (const target of this.targets) {
      for (let i = 0; i < props.length; i++) this.froms.push(this.givenFrom[i] ?? readProp(target, props[i]!));
    }
  }

  private playNested(a: number, b: number, fire: boolean, includeStart: boolean): void {
    const sub = this.nested;
    if (!sub) return;
    if (!this.inited) {
      if (b < this.start) return;
      this.inited = true;
    }
    const total = sub.totalDuration;
    const la = Math.min(total, Math.max(0, a - this.start));
    const lb = Math.min(total, Math.max(0, b - this.start));
    // the nested timeline's own start point is "crossed" when the parent came from outside its span
    const forward = b >= a;
    const subInclude = forward ? a < this.start || (a === this.start && includeStart) : a > this.end || (a === this.end && includeStart);
    if (la === lb && lb === this.last && !subInclude) return;
    this.last = lb;
    sub.playNested(la, lb, fire, subInclude);
  }
}

/**
 * Whether a call at `at` lies in the span the playhead swept from `a` to `b`: the end kept, the start only when
 * `includeStart` says so.
 */
export function crossed(a: number, b: number, at: number, includeStart: boolean): boolean {
  if (at === a) return includeStart;
  return b >= a ? at > a && at <= b : at < a && at >= b;
}
