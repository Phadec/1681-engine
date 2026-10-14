import type { EaseFn } from '../core/eases';

/** One running change of a number over time. */
export interface FxAnimation {
  /** Called with the eased value every frame, and with `to` at the end. */
  set: (value: number) => void;
  from: number;
  to: number;
  ms: number;
  ease: EaseFn;
  /** Runs once after the last `set`. */
  done?: () => void;
  elapsed: number;
  /** A key that cancels whatever animation already holds it (one flash at a time, say). */
  key?: string;
}

const linear: EaseFn = (t) => t;

/**
 * Advances numbers over time for the post effects: a flash fading, a shockwave growing, a vignette breathing. Pure,
 * so it is tested without a renderer; `PostFx` steps it on every frame.
 */
export class FxAnimator {
  private readonly list: FxAnimation[] = [];

  get size(): number {
    return this.list.length;
  }

  /** Starts an animation; one with the same `key` as a running one replaces it (the old one's `done` still runs). */
  run(a: Omit<FxAnimation, 'elapsed' | 'ease'> & { ease?: EaseFn }): void {
    if (a.key !== undefined) {
      const i = this.list.findIndex((x) => x.key === a.key);
      if (i >= 0) this.list.splice(i, 1)[0]!.done?.();
    }
    const anim: FxAnimation = { ...a, ease: a.ease ?? linear, elapsed: 0 };
    anim.set(anim.from);
    if (anim.ms <= 0) {
      anim.set(anim.to);
      anim.done?.();
      return;
    }
    this.list.push(anim);
  }

  /** Moves every animation on by `ms`; finished ones set their last value, call `done` and are dropped. */
  step(ms: number): void {
    for (let i = 0; i < this.list.length; ) {
      const a = this.list[i]!;
      a.elapsed += ms;
      const t = Math.min(1, a.elapsed / a.ms);
      a.set(a.from + (a.to - a.from) * a.ease(t));
      if (t >= 1) {
        this.list.splice(i, 1);
        a.done?.();
      } else i++;
    }
  }

  /** Ends everything at once, each at its last value. */
  finishAll(): void {
    for (const a of this.list.splice(0)) {
      a.set(a.to);
      a.done?.();
    }
  }
}
