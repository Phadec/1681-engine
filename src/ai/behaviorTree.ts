/** What a node answers each tick: done well, done badly, or not done yet. */
export type BtStatus = 'success' | 'failure' | 'running';

/**
 * One node of a tree. Nodes hold no state of their own, so one tree drives any number of agents: what a node must
 * remember between ticks (the child a sequence is on, when a wait began) lives in the agent's memory, `run.state`.
 */
export interface BtNode<C> {
  readonly kind: string;
  /** Shown in a trace; actions and conditions are named after what they do. */
  readonly name?: string;
  readonly children: readonly BtNode<C>[];
  tick(ctx: C, run: BtRun<C>): BtStatus;
  /** A running node left behind (its parent moved on, the tree was reset): undo what it started. */
  halt?(ctx: C, run: BtRun<C>): void;
}

/** What a node may use while it ticks: the agent's clock and memory, and its children's ticks. */
export interface BtRun<C> {
  /** The time this tick was given (ms), for waits, cooldowns and timeouts. */
  readonly now: number;
  /** This node's memory for this agent, made by `init` the first time and after a halt. */
  state<T>(node: BtNode<C>, init: () => T): T;
  /** Memory that outlives the node finishing (a cooldown's ready time); only `reset` clears it. */
  lasting<T>(node: BtNode<C>, init: () => T): T;
  /** Ticks a child; use this, never `child.tick`, so it is traced and halted right. */
  tick(child: BtNode<C>, ctx: C): BtStatus;
  /** Stops a child that was left running, and everything under it. */
  halt(child: BtNode<C>, ctx: C): void;
}

/** One line of `BtAgent.trace`: a node, how deep it is, and what it last answered (null: not ticked this time). */
export interface BtTraceLine {
  depth: number;
  kind: string;
  name: string | undefined;
  status: BtStatus | null;
}

/** A tree's root, and the agents it drives. */
export class BehaviorTree<C> {
  constructor(readonly root: BtNode<C>) {}

  /** A new agent on this tree, with memory of its own. */
  agent(): BtAgent<C> {
    return new BtAgent(this.root);
  }
}

/** One agent running a tree: its memory, and the tick that drives it. */
export class BtAgent<C> implements BtRun<C> {
  now = 0;
  private memory = new Map<BtNode<C>, unknown>();
  private readonly kept = new Map<BtNode<C>, unknown>();
  /** Nodes that answered 'running' last time they ticked: the ones a halt must reach. */
  private readonly open = new Set<BtNode<C>>();
  private last = new Map<BtNode<C>, BtStatus>();
  private seen = new Map<BtNode<C>, BtStatus>();

  constructor(readonly root: BtNode<C>) {}

  /** Ticks the tree once at time `now` (ms) and returns the root's answer. */
  update(ctx: C, now: number): BtStatus {
    this.now = now;
    this.seen = new Map();
    const status = this.tick(this.root, ctx);
    this.last = this.seen;
    return status;
  }

  /** Halts whatever is running and forgets all memory: the agent starts the tree afresh (it died, it was stunned). */
  reset(ctx: C): void {
    this.halt(this.root, ctx);
    this.memory.clear();
    this.kept.clear();
    this.open.clear();
    this.last.clear();
  }

  /** Whether a node is running for this agent now. */
  isRunning(node: BtNode<C>): boolean {
    return this.open.has(node);
  }

  state<T>(node: BtNode<C>, init: () => T): T {
    if (!this.memory.has(node)) this.memory.set(node, init());
    return this.memory.get(node) as T;
  }

  lasting<T>(node: BtNode<C>, init: () => T): T {
    if (!this.kept.has(node)) this.kept.set(node, init());
    return this.kept.get(node) as T;
  }

  tick(child: BtNode<C>, ctx: C): BtStatus {
    const status = child.tick(ctx, this);
    this.seen.set(child, status);
    if (status === 'running') this.open.add(child);
    else {
      this.open.delete(child);
      // a node that finished starts afresh next time it is ticked
      this.memory.delete(child);
    }
    return status;
  }

  halt(child: BtNode<C>, ctx: C): void {
    if (!this.open.has(child)) return;
    for (const c of child.children) this.halt(c, ctx);
    child.halt?.(ctx, this);
    this.open.delete(child);
    this.memory.delete(child);
  }

  /** The tree as it ran on the last tick, depth first: for a debug overlay. */
  trace(): BtTraceLine[] {
    const out: BtTraceLine[] = [];
    const walk = (n: BtNode<C>, depth: number) => {
      out.push({ depth, kind: n.kind, name: n.name, status: this.last.get(n) ?? null });
      for (const c of n.children) walk(c, depth + 1);
    };
    walk(this.root, 0);
    return out;
  }
}

const node = <C>(kind: string, children: readonly BtNode<C>[], tick: BtNode<C>['tick'], extra: Partial<Pick<BtNode<C>, 'name' | 'halt'>> = {}): BtNode<C> => ({
  kind,
  children,
  tick,
  ...extra,
});

/**
 * Runs its children in order until one fails: all must succeed. A running child is resumed on the next tick
 * without asking the ones before it again (`reactiveSequence` does ask them).
 */
export function sequence<C>(...children: BtNode<C>[]): BtNode<C> {
  const self: BtNode<C> = node('sequence', children, (ctx, run) => {
    const s = run.state(self, () => ({ i: 0 }));
    for (; s.i < children.length; s.i++) {
      const status = run.tick(children[s.i]!, ctx);
      if (status !== 'success') return status;
    }
    return 'success';
  });
  return self;
}

/** Tries its children in order until one does not fail: the first that works. Resumes a running child. */
export function selector<C>(...children: BtNode<C>[]): BtNode<C> {
  const self: BtNode<C> = node('selector', children, (ctx, run) => {
    const s = run.state(self, () => ({ i: 0 }));
    for (; s.i < children.length; s.i++) {
      const status = run.tick(children[s.i]!, ctx);
      if (status !== 'failure') return status;
    }
    return 'failure';
  });
  return self;
}

/**
 * A sequence that asks every child from the first again on each tick: a guard in front ("still sees the player?")
 * is checked every time, and when it fails the child that was running is halted.
 */
export function reactiveSequence<C>(...children: BtNode<C>[]): BtNode<C> {
  return reactive('reactive-sequence', children, 'success');
}

/**
 * A selector that asks from the first child again on each tick: a higher-priority branch ("flee when hurt") takes
 * over the moment it can run, halting the lower one it interrupts.
 */
export function reactiveSelector<C>(...children: BtNode<C>[]): BtNode<C> {
  return reactive('reactive-selector', children, 'failure');
}

function reactive<C>(kind: string, children: BtNode<C>[], goOnWhen: BtStatus): BtNode<C> {
  return node(kind, children, (ctx, run) => {
    for (let i = 0; i < children.length; i++) {
      const status = run.tick(children[i]!, ctx);
      if (status === goOnWhen) continue;
      // whatever was running further along is no longer wanted
      for (let j = i + 1; j < children.length; j++) run.halt(children[j]!, ctx);
      return status;
    }
    return goOnWhen;
  });
}

export interface ParallelPolicy {
  /** Children that must succeed for the whole to (default all). */
  succeed?: number;
  /** Children that must fail for the whole to (default 1). */
  fail?: number;
}

/**
 * Ticks every child each tick (walk and look about at once). Succeeds once `succeed` have succeeded, fails once
 * `fail` have failed, halting the rest; a child that finished is not ticked again until the whole finishes.
 */
export function parallel<C>(policy: ParallelPolicy, ...children: BtNode<C>[]): BtNode<C> {
  const needOk = Math.min(children.length, policy.succeed ?? children.length);
  const needFail = Math.min(children.length, policy.fail ?? 1);
  const self: BtNode<C> = node('parallel', children, (ctx, run) => {
    const done = run.state(self, () => new Map<number, BtStatus>());
    for (let i = 0; i < children.length; i++) {
      if (done.has(i)) continue;
      const status = run.tick(children[i]!, ctx);
      if (status !== 'running') done.set(i, status);
    }
    let ok = 0;
    let bad = 0;
    for (const s of done.values()) s === 'success' ? ok++ : bad++;
    if (ok < needOk && bad < needFail) return 'running';
    for (const c of children) run.halt(c, ctx);
    return ok >= needOk ? 'success' : 'failure';
  });
  return self;
}

/** Swaps success and failure. */
export function invert<C>(child: BtNode<C>): BtNode<C> {
  return node('invert', [child], (ctx, run) => {
    const s = run.tick(child, ctx);
    return s === 'success' ? 'failure' : s === 'failure' ? 'success' : 'running';
  });
}

/** Succeeds whatever its child answers, once the child is done: an optional step. */
export function succeed<C>(child: BtNode<C>): BtNode<C> {
  return node('succeed', [child], (ctx, run) => (run.tick(child, ctx) === 'running' ? 'running' : 'success'));
}

/**
 * Runs its child `times` times in a row (Infinity: for good), stopping at the first failure. One pass per tick at
 * most, so a child that succeeds at once cannot spin a frame.
 */
export function repeat<C>(times: number, child: BtNode<C>): BtNode<C> {
  const self: BtNode<C> = node('repeat', [child], (ctx, run) => {
    const s = run.state(self, () => ({ n: 0 }));
    const status = run.tick(child, ctx);
    if (status !== 'success') return status;
    s.n++;
    return s.n >= times ? 'success' : 'running';
  });
  return self;
}

/** Tries its child up to `times` times until it succeeds, a try a tick. */
export function retry<C>(times: number, child: BtNode<C>): BtNode<C> {
  const self: BtNode<C> = node('retry', [child], (ctx, run) => {
    const s = run.state(self, () => ({ n: 0 }));
    const status = run.tick(child, ctx);
    if (status !== 'failure') return status;
    s.n++;
    return s.n >= times ? 'failure' : 'running';
  });
  return self;
}

/** Runs its child at most once every `ms`: after it finishes, it fails at once until the time is up. */
export function cooldown<C>(ms: number, child: BtNode<C>): BtNode<C> {
  const self: BtNode<C> = node('cooldown', [child], (ctx, run) => {
    const s = run.lasting(self, () => ({ readyAt: -Infinity }));
    if (run.now < s.readyAt) return 'failure';
    const status = run.tick(child, ctx);
    if (status !== 'running') s.readyAt = run.now + ms;
    return status;
  });
  return self;
}

/** Fails, halting its child, when the child has run longer than `ms`. */
export function timeout<C>(ms: number, child: BtNode<C>): BtNode<C> {
  const self: BtNode<C> = node('timeout', [child], (ctx, run) => {
    const s = run.state(self, () => ({ began: run.now }));
    if (run.now - s.began >= ms) {
      run.halt(child, ctx);
      return 'failure';
    }
    return run.tick(child, ctx);
  });
  return self;
}

/** Runs for `ms`, then succeeds. */
export function wait<C>(ms: number): BtNode<C> {
  const self: BtNode<C> = node('wait', [], (_ctx, run) => {
    const s = run.state(self, () => ({ began: run.now }));
    return run.now - s.began >= ms ? 'success' : 'running';
  });
  return self;
}

/** A test: success when `test` holds, else failure. Never runs. */
export function condition<C>(name: string, test: (ctx: C) => boolean): BtNode<C> {
  return node('condition', [], (ctx) => (test(ctx) ? 'success' : 'failure'), { name });
}

export interface ActionOptions<C> {
  /** The action was running and the tree left it (a higher branch took over): stop what it started. */
  onHalt?: (ctx: C) => void;
}

/** Something the agent does: `run` answers each tick until the doing is done. */
export function action<C>(name: string, run: (ctx: C, now: number) => BtStatus, options: ActionOptions<C> = {}): BtNode<C> {
  return node('action', [], (ctx, r) => run(ctx, r.now), { name, halt: options.onHalt ? (ctx) => options.onHalt!(ctx) : undefined });
}
