import type { Actions } from './Actions';

/**
 * A recording of what a player did, step by step, as plain JSON: attach it to a bug report and the bug plays again,
 * or keep it as a replay. Only changes are kept (an action's value on the step it changed), so a minute of play is a
 * few hundred numbers, not thousands.
 */
export interface InputTape {
  version: 1;
  /** The actions, in the order `changes` refers to them. */
  actions: string[];
  /** Steps recorded. */
  steps: number;
  /** `[step, action index, value]`, in step order: from that step on the action reads `value` (0 up, 1 held). */
  changes: [number, number, number][];
  /** The game's own: a seed, a level, a build, whatever the replay needs to start the same. */
  meta?: Record<string, unknown>;
}

/**
 * Records an `Actions`' every step until stopped.
 *
 * ```ts
 * const rec = new InputRecorder(actions, { seed, level: 'forest-2' });
 * // … play …
 * const tape = rec.stop(); // JSON.stringify it into the bug report
 * ```
 */
export class InputRecorder<A extends string> {
  private readonly order: A[] = [];
  private readonly index = new Map<A, number>();
  private readonly last = new Map<A, number>();
  private readonly changes: [number, number, number][] = [];
  private steps = 0;
  private readonly untap: () => void;
  private stopped: InputTape | null = null;

  constructor(
    actions: Actions<A>,
    private readonly meta?: Record<string, unknown>,
  ) {
    this.untap = actions.tap((values) => this.capture(values));
  }

  /** Steps recorded so far. */
  get length(): number {
    return this.steps;
  }

  /** Stops recording and returns the tape (the same one on every later call). */
  stop(): InputTape {
    if (this.stopped) return this.stopped;
    this.untap();
    this.stopped = { version: 1, actions: [...this.order], steps: this.steps, changes: this.changes.map((c) => [...c] as [number, number, number]) };
    if (this.meta) this.stopped.meta = structuredClone(this.meta);
    return this.stopped;
  }

  private capture(values: ReadonlyMap<A, number>): void {
    const step = this.steps++;
    // values kept whole: a stick rounded on the tape would walk the replay off the recorded game, a little a step
    for (const [action, v] of values) this.note(step, action, v);
    // what was held and is not in this step's values went up
    for (const [action, v] of this.last) if (v !== 0 && !values.has(action)) this.note(step, action, 0);
  }

  private note(step: number, action: A, v: number): void {
    if ((this.last.get(action) ?? 0) === v) return;
    let i = this.index.get(action);
    if (i === undefined) {
      i = this.order.length;
      this.order.push(action);
      this.index.set(action, i);
    }
    this.last.set(action, v);
    this.changes.push([step, i, v]);
  }
}

/**
 * Plays a tape into an `Actions`: each `poll` takes the next step from it instead of the devices, and when the tape
 * ends the devices answer again (`onEnd` says so).
 *
 * ```ts
 * new InputPlayer(tape).playInto(actions, () => console.log('replay over'));
 * ```
 */
export class InputPlayer<A extends string = string> {
  private step = 0;
  private next = 0;
  private readonly values = new Map<A, number>();

  constructor(readonly tape: InputTape) {
    const ok =
      tape?.version === 1 &&
      Array.isArray(tape.actions) &&
      Number.isInteger(tape.steps) &&
      Array.isArray(tape.changes) &&
      tape.changes.every((c, k) => Array.isArray(c) && c.length === 3 && c.every(Number.isFinite) && c[1] >= 0 && c[1] < tape.actions.length && (k === 0 || c[0] >= tape.changes[k - 1]![0]));
    if (!ok) throw new Error('InputPlayer: not an input tape (version 1)');
  }

  /** Steps played so far. */
  get position(): number {
    return this.step;
  }

  get done(): boolean {
    return this.step >= this.tape.steps;
  }

  /** The next step's values, or null once the tape is over. */
  read(): ReadonlyMap<A, number> | null {
    if (this.done) return null;
    const changes = this.tape.changes;
    while (this.next < changes.length && changes[this.next]![0] === this.step) {
      const [, i, v] = changes[this.next++]!;
      const action = this.tape.actions[i] as A;
      if (v === 0) this.values.delete(action);
      else this.values.set(action, v);
    }
    this.step++;
    return this.values;
  }

  /** Drives `actions` from the tape until it ends; `onEnd` is called on the poll that finds it over. */
  playInto<B extends string>(actions: Actions<B>, onEnd?: () => void): void {
    actions.replay(() => {
      // a tape names its actions as strings; an action the game does not have is simply never read
      const v = this.read() as ReadonlyMap<B, number> | null;
      if (v === null) onEnd?.();
      return v;
    });
  }
}
