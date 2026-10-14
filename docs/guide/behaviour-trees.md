# Behaviour trees

A behaviour tree decides what an agent does: a guard that patrols, chases what it sees and flees when hurt. Each tick
the tree is walked from its root; every node answers `success`, `failure` or `running` (not done yet, ask again next
tick). The engine's trees are pure logic: no Pixi, no clock of their own (each tick is given the time), so the same
tree runs on a client, on a server and in a test.

## A tree and its agents

```ts
import { BehaviorTree, reactiveSelector, sequence, condition, action, cooldown, wait } from '1681-engine';

interface Guard { body: Body; target: Body | null; hp: number }

const tree = new BehaviorTree<Guard>(
  reactiveSelector(
    sequence(condition('hurt', (g) => g.hp < 3), action('flee', (g) => fleeFrom(g) ? 'success' : 'running')),
    sequence(condition('sees', (g) => g.target !== null), action('chase', chase, { onHalt: (g) => g.body.stop() })),
    sequence(action('walk to post', walkToPost), wait(2000)),
  ),
);

const brain = tree.agent(); // one per guard
// each fixed step, or a few times a second:
brain.update(guard, now);
```

Nodes hold no state, so one tree drives any number of agents. What a node must remember between ticks (which child a
sequence is on, when a wait began) lives in the agent (`tree.agent()`). `agent.reset(ctx)` halts what runs and starts
the tree afresh (the guard died, was stunned, changed map).

## Nodes

| Node | What it does |
|---|---|
| `sequence(...)` | Children in order until one fails; all must succeed. A running child is resumed without asking the ones before it again. |
| `selector(...)` | Children in order until one does not fail: the first that works. |
| `reactiveSequence(...)` | A sequence that asks every child from the first again each tick: a guard in front is checked every time, and when it fails the running child is halted. |
| `reactiveSelector(...)` | A selector that asks from the first child each tick: a higher-priority branch takes over the moment it can, halting the one it interrupts. |
| `parallel({ succeed, fail }, ...)` | Ticks every child each tick; succeeds once `succeed` have (default all), fails once `fail` have (default 1), halting the rest. |
| `invert(child)` | Swaps success and failure. |
| `succeed(child)` | Succeeds whatever the child answers, once it is done. |
| `repeat(times, child)` | The child `times` times in a row (`Infinity` for good), stopping at a failure; one pass a tick. |
| `retry(times, child)` | Tries the child until it succeeds, up to `times`, a try a tick. |
| `cooldown(ms, child)` | Runs the child at most once every `ms`; fails at once in between. |
| `timeout(ms, child)` | Fails, halting the child, when it has run `ms`. |
| `wait(ms)` | Runs for `ms`, then succeeds. |
| `condition(name, test)` | Success when `test(ctx)` holds, else failure. |
| `action(name, run, { onHalt })` | `run(ctx, now)` answers each tick; `onHalt` undoes what it started when the tree leaves it running. |

**Halting** is what makes reactive trees safe: when a branch is left while it runs (a reactive selector switched to
a higher branch, a timeout expired, a parallel finished), every running node under it is halted, deepest first, and
an action's `onHalt` runs. Stop an animation, release a reserved tile, cancel a path request there.

## A node of your own

A node is `{ kind, name?, children, tick(ctx, run), halt?(ctx, run) }`. Tick children with `run.tick(child, ctx)`,
never `child.tick`, so they are traced and halted right. Keep memory in `run.state(node, init)` (cleared when the node
finishes or is halted) or `run.lasting(node, init)` (kept until `reset`).

```ts
const chance = <C>(p: number, child: BtNode<C>): BtNode<C> => ({
  kind: 'chance',
  children: [child],
  tick: (ctx, run) => (rng() < p ? run.tick(child, ctx) : 'failure'),
});
```

## Trees as data

A designer can write a tree as JSON and name the leaves the game registers:

```ts
import { buildTree, BehaviorTree, type BtSpec } from '1681-engine';

const spec: BtSpec = {
  type: 'reactiveSelector',
  children: [
    { type: 'sequence', children: [{ type: 'condition', name: 'hurt' }, { type: 'tree', name: 'flee' }] },
    { type: 'cooldown', ms: 2000, child: { type: 'action', name: 'bark' } },
    { type: 'action', name: 'wander' },
  ],
};

const root = buildTree<Guard>(spec, {
  conditions: { hurt: (g) => g.hp < 3 },
  actions: { bark, wander: { run: wander, onHalt: (g) => g.body.stop() }, run: runAway },
  trees: { flee: { type: 'sequence', children: [{ type: 'action', name: 'run' }] } }, // shared subtrees
});
const tree = new BehaviorTree(root);
```

`buildTree` throws on an unknown type, leaf or subtree, naming the path (`$.children[1].child: no action 'bark'`).
Build trees once, at load, not per agent.

## Debugging

`agent.trace()` lists the tree depth first with what each node answered on the last tick (`null` when it was not
ticked): enough for a debug overlay that indents names and colours them by status. `formatTrace(agent.trace())` is
that as indented text, for a `Text` in the overlay or a log. `agent.isRunning(node)` asks
about one node.

## Pitfalls

- **Pass the time.** `update(ctx, now)` takes the time from you; waits, cooldowns and timeouts run on it. Use the
  fixed step's time for a tree that must match a server, the frame's for one that only draws.
- **A plain sequence does not re-check its guard.** `sequence(condition('sees'), chase)` keeps chasing after the
  target is gone, because the running `chase` is resumed without asking `sees` again. Use `reactiveSequence` when a
  condition must hold for the whole action.
- **A reactive sequence ticks earlier actions again.** Put only conditions (or actions that are cheap and safe to
  repeat) in front of the running one.
- **Actions return `running` until they are done.** An action that returns `success` at once every tick under
  `repeat(Infinity)` runs once a tick, not in a loop: a tree never spins a frame.

## API

[`BehaviorTree`](/api/index/classes/BehaviorTree) · [`BtAgent`](/api/index/classes/BtAgent) ·
[`BtNode`](/api/index/interfaces/BtNode) · [`buildTree`](/api/index/functions/buildTree) ·
[`BtSpec`](/api/index/type-aliases/BtSpec)
