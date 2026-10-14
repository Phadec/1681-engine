import { TimelineBuilder } from './TimelineBuilder';
import type { NestedPlay } from './TimelineChild';
import type { Steppable, Tweener, TweenTarget } from './Tweener';

export interface TimelineOptions {
  /**
   * The manager that steps it: `stage.tweens` makes it follow the stage's `timeScale` and stop with the stage. Leave
   * it out to step the timeline yourself with `update(dt)` (a fixed step, a test, a timeline played by another).
   */
  tweens?: Tweener;
  /** Built but not playing until `play()` / `resume()`. */
  paused?: boolean;
  /** Extra plays after the first (-1 = forever). */
  repeat?: number;
  /** Every second play runs backwards. */
  yoyo?: boolean;
  /** Ms of stillness between plays. */
  repeatDelay?: number;
  /** Its own speed factor, on top of its manager's. */
  timeScale?: number;
  onUpdate?: (timeline: Timeline) => void;
  onRepeat?: (timeline: Timeline) => void;
  /** When the playhead reaches the end it is playing toward: the end, or the start when reversed. */
  onComplete?: (timeline: Timeline) => void;
}

/**
 * Tweens and calls laid out in time and played as one: in sequence by default, overlapping by position (`'<'`,
 * `'-=100'`, a label), side by side in `parallel` groups, nested (`add`). It can repeat, yoyo, run at its own speed,
 * pause, seek and play backwards, and `finished` resolves when it completes.
 *
 * Built in one go, then it plays: a timeline stepped while empty has nothing left to do and completes, so build it in
 * the frame it is made (or make it `paused` and `play()` it later). Children are kept sorted by start, which is the
 * order they are played in going forward (and the reverse going back), so a later tween on the same property wins.
 */
export class Timeline extends TimelineBuilder implements Steppable, NestedPlay {
  timeScale: number;
  readonly repeat: number;
  readonly yoyo: boolean;
  readonly repeatDelay: number;
  /** A timeline holds no targets of its own for `Tweener.killTweensOf`: stop it with `kill()`. */
  readonly targets: readonly object[] = [];
  private readonly options: TimelineOptions;
  private time = 0;
  private paused: boolean;
  private reversed = false;
  private done = false;
  private killed = false;
  /** In its manager's list: set again by anything that brings a finished timeline back to life. */
  private listed = false;
  /** The next render starts the run: a call standing at its first point fires. */
  private fresh = true;
  private nestedIn: Timeline | null = null;
  private resolveFinished: () => void = () => undefined;
  private finishedPromise: Promise<void>;
  private settled = false;
  /** Scratch for `locate`, so moving the playhead allocates nothing. */
  private locCycle = 0;
  private locLocal = 0;

  constructor(options: TimelineOptions = {}) {
    super();
    this.options = options;
    this.repeat = options.repeat ?? 0;
    this.yoyo = options.yoyo ?? false;
    this.repeatDelay = Math.max(0, options.repeatDelay ?? 0);
    this.timeScale = options.timeScale ?? 1;
    this.paused = options.paused ?? false;
    this.finishedPromise = this.newPromise();
    this.relist();
  }

  protected adopt(child: TimelineBuilder): NestedPlay {
    if (!(child instanceof Timeline) || child === this || child.nestedIn) throw new Error('Timeline.add: a timeline is played by one parent at most, never itself');
    if (!Number.isFinite(child.totalDuration)) throw new Error('Timeline.add: a timeline that repeats forever cannot be nested');
    child.nestedIn = this;
    return child;
  }

  // ── playing ───────────────────────────────────────────────────────────────────────────────────────────────────

  /** Every play and the delays between them, ms; Infinity when it repeats forever. */
  get totalDuration(): number {
    if (this.repeat === -1) return Infinity;
    return this.duration * (this.repeat + 1) + this.repeatDelay * this.repeat;
  }

  /** Where the playhead stands, ms from the start of the first play. */
  get currentTime(): number {
    return this.time;
  }

  /** 0–1 over the whole run (over the current play when it repeats forever). */
  get progress(): number {
    const total = this.totalDuration;
    if (Number.isFinite(total)) return total > 0 ? this.time / total : 1;
    const d = this.duration;
    if (d <= 0) return 1;
    this.locate(this.time, total);
    return this.locLocal / d;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isReversed(): boolean {
    return this.reversed;
  }

  /** Still has somewhere to go: not completed, not killed. */
  get isActive(): boolean {
    return !this.done && !this.killed;
  }

  /** Resolves when the timeline completes (or is killed, so nothing awaits it forever). A restart makes a new one. */
  get finished(): Promise<void> {
    return this.finishedPromise;
  }

  /** Advances by `dt` ms (× `timeScale`): how a timeline with no manager is played. */
  update(dt: number): void {
    this.tick(dt);
  }

  /** @internal The manager's step: false once there is nothing left to play. */
  step(dt: number): boolean {
    // dropped by the manager if anything below throws: only a clean return keeps it listed
    this.listed = false;
    const alive = this.tick(dt);
    this.listed = alive;
    return alive;
  }

  pause(): this {
    this.paused = true;
    return this;
  }

  /** Carries on the way it was going. */
  resume(): this {
    this.paused = false;
    this.wake();
    return this;
  }

  /** Plays forward from where it stands. */
  play(): this {
    this.reversed = false;
    return this.resume();
  }

  /** Turns round and plays toward the start (or forward again, if it was reversed). */
  reverse(): this {
    this.reversed = !this.reversed;
    return this.resume();
  }

  /**
   * Jumps to `to` (ms or a label) and shows it there. Calls on the way are skipped unless `fireCalls`; the playing
   * state is kept, so a paused timeline stays paused.
   */
  seek(to: number | string, fireCalls = false): this {
    const total = this.totalDuration;
    const at = typeof to === 'number' ? to : this.labels.get(to);
    if (at === undefined) throw new Error(`Timeline.seek: no label "${to}"`);
    const target = Math.min(total, Math.max(0, at));
    this.render(this.time, target, fireCalls, this.fresh && fireCalls);
    this.time = target;
    this.fresh = false;
    this.wake();
    return this;
  }

  /** Back to the start, playing forward, with a new `finished` if the old one was settled. */
  restart(): this {
    this.render(this.time, 0, false, false);
    this.time = 0;
    this.reversed = false;
    this.paused = false;
    this.fresh = true;
    if (this.settled) this.finishedPromise = this.newPromise();
    this.wake();
    return this;
  }

  /** Stops for good where it stands (nothing is put back) and settles `finished`. */
  kill(): void {
    this.killed = true;
    this.settle();
  }

  /** @internal The manager's name for `kill` (`Tweener.clear`, a stage destroyed). */
  remove(): void {
    this.kill();
  }

  /** @internal Played by a parent: its own time and calls, as one span. */
  playNested(from: number, to: number, fire: boolean, includeStart: boolean): void {
    this.render(from, to, fire, includeStart);
    this.time = to;
    this.options.onUpdate?.(this);
    if (to >= this.totalDuration && from < to) this.options.onComplete?.(this);
  }

  // ── inside ────────────────────────────────────────────────────────────────────────────────────────────────────

  private tick(dt: number): boolean {
    if (this.killed || this.nestedIn) return false;
    if (this.done) return false;
    if (this.paused) return true;
    const total = this.totalDuration;
    const from = this.time;
    const delta = dt * this.timeScale;
    let to = this.reversed ? from - delta : from + delta;
    if (to > total) to = total;
    if (to < 0) to = 0;
    if (to !== from || this.fresh) {
      this.render(from, to, true, this.fresh);
      this.time = to;
      this.fresh = false;
      this.options.onUpdate?.(this);
    }
    if (this.killed) return false;
    if (this.reversed ? to <= 0 : to >= total) {
      this.done = true;
      this.options.onComplete?.(this);
      this.settle();
      return false;
    }
    return true;
  }

  /** Moves the playhead from `from` to `to` (total time), play by play. */
  private render(from: number, to: number, fire: boolean, includeStart: boolean): void {
    const d = this.duration;
    const total = this.totalDuration;
    const period = d + this.repeatDelay;
    if (this.repeat === 0 || period <= 0) {
      this.playCycle(0, Math.min(d, Math.max(0, from)), Math.min(d, Math.max(0, to)), fire, includeStart);
      return;
    }
    this.locate(from, total);
    const ca = this.locCycle;
    const la = this.locLocal;
    this.locate(to, total);
    const cb = this.locCycle;
    const lb = this.locLocal;
    if (ca === cb) {
      this.playCycle(ca, la, lb, fire, includeStart);
      return;
    }
    // a yoyo's turn has just played its end point, so the next play leaves it out; a plain repeat starts afresh
    const restart = !this.yoyo;
    if (cb > ca) {
      this.playCycle(ca, la, d, fire, includeStart);
      // a frame that crosses many plays (a very short timeline) shows only the last two
      for (let c = Math.max(ca + 1, cb - 1); c <= cb; c++) {
        if (this.nextPlay()) return;
        this.playCycle(c, 0, c === cb ? lb : d, fire, restart);
      }
    } else {
      this.playCycle(ca, la, 0, fire, includeStart);
      for (let c = Math.min(ca - 1, cb + 1); c >= cb; c--) {
        if (this.nextPlay()) return;
        this.playCycle(c, d, c === cb ? lb : 0, fire, restart);
      }
    }
  }

  /** A play boundary: `onRepeat`, and a forever timeline whose every target is gone ends here. Answers "stop". */
  private nextPlay(): boolean {
    if (this.repeat === -1 && this.orphaned()) {
      this.kill();
      return true;
    }
    this.options.onRepeat?.(this);
    return this.killed;
  }

  private playCycle(cycle: number, a: number, b: number, fire: boolean, includeStart: boolean): void {
    if (this.yoyo && cycle % 2 === 1) {
      const d = this.duration;
      a = d - a;
      b = d - b;
    }
    const list = this.children;
    if (b >= a) for (let i = 0; i < list.length; i++) list[i]!.play(a, b, fire, includeStart);
    else for (let i = list.length - 1; i >= 0; i--) list[i]!.play(a, b, fire, includeStart);
  }

  /** Total time → play and time within it, into `locCycle` / `locLocal`. */
  private locate(t: number, total: number): void {
    const d = this.duration;
    if (t >= total) {
      this.locCycle = this.repeat;
      this.locLocal = d;
      return;
    }
    const period = d + this.repeatDelay;
    const c = Math.floor(t / period);
    this.locCycle = c;
    this.locLocal = Math.min(d, t - c * period);
  }

  /**
   * Every tween's every target is a destroyed display object. Checked only when a forever timeline turns round, as
   * `Tween` drops a forever tween whose sprites were freed: otherwise it would hold them for good.
   */
  private orphaned(): boolean {
    let any = false;
    for (const c of this.children) {
      if (c.kind !== 'tween') continue;
      for (const t of c.targets) {
        if ((t as TweenTarget).destroyed !== true) return false;
        any = true;
      }
    }
    return any;
  }

  /** Brought back to life (reversed, sought, restarted, resumed): its manager steps it again. */
  private wake(): void {
    if (this.killed) return;
    // the next step finds out whether there is anywhere left to go, and completes it if not
    this.done = false;
    this.relist();
  }

  private relist(): void {
    const tweens = this.options.tweens;
    if (!tweens || this.listed || this.killed || this.nestedIn) return;
    this.listed = true;
    tweens.run(this);
  }

  private settle(): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveFinished();
  }

  private newPromise(): Promise<void> {
    this.settled = false;
    return new Promise<void>((resolve) => {
      this.resolveFinished = resolve;
    });
  }
}
