import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  action,
  BehaviorTree,
  formatTrace,
  condition,
  cooldown,
  invert,
  parallel,
  reactiveSelector,
  reactiveSequence,
  repeat,
  retry,
  selector,
  sequence,
  succeed,
  timeout,
  wait,
  type BtStatus,
} from './behaviorTree.ts';
import { buildTree, type BtSpec } from './buildTree.ts';

/** A blackboard with a log of what the actions did. */
interface Bb {
  log: string[];
  flags: Record<string, boolean>;
}
const bb = (flags: Record<string, boolean> = {}): Bb => ({ log: [], flags });
const is = (flag: string) => condition<Bb>(flag, (c) => !!c.flags[flag]);
/** An action that runs for `ticks` ticks, then answers `end`; logs each tick and each halt. */
function doing(name: string, ticks = 1, end: BtStatus = 'success') {
  let left = new WeakMap<Bb, number>();
  return action<Bb>(
    name,
    (c) => {
      const n = (left.get(c) ?? ticks) - 1;
      c.log.push(name);
      if (n > 0) {
        left.set(c, n);
        return 'running';
      }
      left.delete(c);
      return end;
    },
    {
      onHalt: (c) => {
        c.log.push(`${name}!`);
        left = new WeakMap();
      },
    },
  );
}

test('a sequence runs its children in order, resumes a running one, and stops at a failure', () => {
  const c = bb();
  const agent = new BehaviorTree(sequence(doing('a'), doing('b', 2), doing('c', 1, 'failure'), doing('d'))).agent();
  assert.equal(agent.update(c, 0), 'running');
  assert.deepEqual(c.log, ['a', 'b']);
  assert.equal(agent.update(c, 1), 'failure');
  assert.deepEqual(c.log, ['a', 'b', 'b', 'c'], 'a is not asked again, d never');
  // done, it starts over
  c.log.length = 0;
  agent.update(c, 2);
  assert.deepEqual(c.log, ['a', 'b']);
});

test('a selector takes the first child that does not fail', () => {
  const c = bb({ near: false });
  const agent = new BehaviorTree(selector(sequence(is('near'), doing('bite')), doing('walk'))).agent();
  assert.equal(agent.update(c, 0), 'success');
  assert.deepEqual(c.log, ['walk']);
  c.flags.near = true;
  agent.update(c, 1);
  assert.deepEqual(c.log, ['walk', 'bite']);
  assert.equal(new BehaviorTree(selector<Bb>(is('x'), is('y'))).agent().update(c, 0), 'failure');
});

test('a reactive selector lets a higher branch take over, halting the one it interrupts', () => {
  const c = bb({ hurt: false });
  const agent = new BehaviorTree(reactiveSelector(sequence(is('hurt'), doing('flee', 3)), doing('wander', 10))).agent();
  agent.update(c, 0);
  agent.update(c, 1);
  assert.deepEqual(c.log, ['wander', 'wander']);
  c.flags.hurt = true;
  agent.update(c, 2);
  assert.deepEqual(c.log, ['wander', 'wander', 'flee', 'wander!']);
  // a plain selector would have gone on wandering
  const c2 = bb({ hurt: false });
  const plain = new BehaviorTree(selector(sequence(is('hurt'), doing('flee', 3)), doing('wander', 10))).agent();
  plain.update(c2, 0);
  c2.flags.hurt = true;
  plain.update(c2, 1);
  assert.deepEqual(c2.log, ['wander', 'wander']);
});

test('a reactive sequence checks its guard every tick and halts the running child when it fails', () => {
  const c = bb({ sees: true });
  const chase = doing('chase', 10);
  const agent = new BehaviorTree(reactiveSequence(is('sees'), chase)).agent();
  agent.update(c, 0);
  agent.update(c, 1);
  assert.equal(agent.isRunning(chase), true);
  c.flags.sees = false;
  assert.equal(agent.update(c, 2), 'failure');
  assert.deepEqual(c.log, ['chase', 'chase', 'chase!']);
  assert.equal(agent.isRunning(chase), false);
});

test('parallel succeeds or fails by its policy, halting what still runs', () => {
  const c = bb();
  const all = new BehaviorTree(parallel({}, doing('walk', 3), doing('look', 1))).agent();
  assert.equal(all.update(c, 0), 'running');
  assert.equal(all.update(c, 1), 'running');
  assert.equal(all.update(c, 2), 'success');
  assert.deepEqual(c.log, ['walk', 'look', 'walk', 'walk'], 'look finished and was not ticked again');
  const c2 = bb();
  const one = new BehaviorTree(parallel({ succeed: 1 }, doing('walk', 5), doing('look', 2))).agent();
  one.update(c2, 0);
  assert.equal(one.update(c2, 1), 'success');
  assert.deepEqual(c2.log, ['walk', 'look', 'walk', 'look', 'walk!']);
  const c3 = bb();
  const failing = new BehaviorTree(parallel({ fail: 1 }, doing('walk', 5), doing('trip', 1, 'failure'))).agent();
  assert.equal(failing.update(c3, 0), 'failure');
  assert.deepEqual(c3.log, ['walk', 'trip', 'walk!']);
});

test('decorators: invert, succeed, repeat and retry', () => {
  const c = bb();
  assert.equal(new BehaviorTree(invert(is('no'))).agent().update(c, 0), 'success');
  assert.equal(new BehaviorTree(invert(doing('x', 2))).agent().update(c, 0), 'running');
  assert.equal(new BehaviorTree(succeed(doing('f', 1, 'failure'))).agent().update(c, 0), 'success');
  const rep = new BehaviorTree(repeat(3, doing('step'))).agent();
  const seen = [0, 1, 2].map((t) => rep.update(c, t));
  assert.deepEqual(seen, ['running', 'running', 'success'], 'one pass a tick');
  const forever = new BehaviorTree(repeat(Infinity, doing('idle'))).agent();
  for (let t = 0; t < 50; t++) assert.equal(forever.update(c, t), 'running');
  const r = new BehaviorTree(retry(2, doing('pick', 1, 'failure'))).agent();
  assert.deepEqual([r.update(c, 0), r.update(c, 1)], ['running', 'failure']);
  const stopsOnFail = new BehaviorTree(repeat(5, doing('f', 1, 'failure'))).agent();
  assert.equal(stopsOnFail.update(c, 0), 'failure');
});

test('wait, timeout and cooldown run on the time the tick is given', () => {
  const c = bb();
  const w = new BehaviorTree(wait<Bb>(100)).agent();
  assert.deepEqual([w.update(c, 1000), w.update(c, 1050), w.update(c, 1100)], ['running', 'running', 'success']);
  assert.equal(w.update(c, 1100), 'running', 'and it starts again');
  const t = new BehaviorTree(timeout(100, doing('dig', 99))).agent();
  assert.equal(t.update(c, 0), 'running');
  assert.equal(t.update(c, 99), 'running');
  assert.equal(t.update(c, 100), 'failure');
  assert.equal(c.log.at(-1), 'dig!');
  const c2 = bb();
  const cd = new BehaviorTree(cooldown(500, doing('bark'))).agent();
  const answers = [0, 100, 499, 500, 600].map((now) => cd.update(c2, now));
  assert.deepEqual(answers, ['success', 'failure', 'failure', 'success', 'failure']);
  // a reset forgets the cooldown with the rest
  cd.reset(c2);
  assert.equal(cd.update(c2, 601), 'success');
});

test('one tree drives many agents, each with its own memory', () => {
  const tree = new BehaviorTree(sequence(doing('a'), wait<Bb>(100), doing('b')));
  const x = tree.agent();
  const y = tree.agent();
  const cx = bb();
  const cy = bb();
  x.update(cx, 0);
  y.update(cy, 50);
  x.update(cx, 100);
  y.update(cy, 100);
  assert.deepEqual(cx.log, ['a', 'b']);
  assert.deepEqual(cy.log, ['a']);
});

test('a reset halts what runs and starts the tree afresh', () => {
  const c = bb();
  const agent = new BehaviorTree(sequence(doing('a'), doing('long', 10))).agent();
  agent.update(c, 0);
  agent.reset(c);
  assert.deepEqual(c.log, ['a', 'long', 'long!']);
  agent.update(c, 1);
  assert.equal(c.log.at(-2), 'a');
});

test('the trace shows the tree as it ran on the last tick', () => {
  const c = bb({ hurt: false });
  const agent = new BehaviorTree(selector(sequence(is('hurt'), doing('flee')), doing('wander', 5))).agent();
  agent.update(c, 0);
  assert.deepEqual(
    agent.trace().map((l) => `${'  '.repeat(l.depth)}${l.name ?? l.kind}:${l.status}`),
    ['selector:running', '  sequence:failure', '    hurt:failure', '    flee:null', '  wander:running'],
  );
});

test('a tree built from data runs the same as one written in code', () => {
  const spec: BtSpec = {
    type: 'reactiveSelector',
    children: [
      { type: 'sequence', children: [{ type: 'condition', name: 'hurt' }, { type: 'tree', name: 'flee' }] },
      { type: 'cooldown', ms: 1000, child: { type: 'action', name: 'bark' } },
      { type: 'repeat', times: 2, child: { type: 'action', name: 'wander' } },
    ],
  };
  const c = bb({ hurt: false });
  const root = buildTree<Bb>(spec, {
    conditions: { hurt: (x) => !!x.flags.hurt },
    actions: {
      bark: (x) => (x.log.push('bark'), 'success'),
      wander: { run: (x) => (x.log.push('wander'), 'running'), onHalt: (x) => x.log.push('wander!') },
      run: (x) => (x.log.push('run'), 'success'),
    },
    trees: { flee: { type: 'sequence', children: [{ type: 'wait', ms: 0 }, { type: 'action', name: 'run' }] } },
  });
  const agent = new BehaviorTree(root).agent();
  agent.update(c, 0);
  agent.update(c, 10);
  c.flags.hurt = true;
  agent.update(c, 20);
  assert.deepEqual(c.log, ['bark', 'wander', 'run', 'wander!'], 'the wander it interrupted is halted');
});

test('a bad data tree is refused with the path to the fault', () => {
  const reg = { actions: { go: () => 'success' as BtStatus }, trees: { loop: { type: 'tree', name: 'loop' } as BtSpec } };
  assert.throws(() => buildTree({ type: 'sequence', children: [{ type: 'action', name: 'go' }, { type: 'action', name: 'fly' }] }, reg), /\$\.children\[1\]: no action 'fly'/);
  assert.throws(() => buildTree({ type: 'selector', children: [] }, reg), /needs children/);
  assert.throws(() => buildTree({ type: 'wait', ms: -1 }, reg), /ms must be/);
  assert.throws(() => buildTree({ type: 'bogus' } as unknown as BtSpec, reg), /unknown type 'bogus'/);
  assert.throws(() => buildTree({ type: 'tree', name: 'loop' }, reg), /contains itself/);
  assert.throws(() => buildTree({ type: 'condition', name: 'x' }, reg), /no condition 'x'/);
});

test('a trace reads as indented text', () => {
  const c = bb({ hurt: false });
  const agent = new BehaviorTree(selector(sequence(is('hurt'), doing('flee')), doing('wander', 5))).agent();
  agent.update(c, 0);
  assert.equal(formatTrace(agent.trace()), 'selector running\n  sequence failure\n    hurt failure\n    flee ·\n  wander running');
});
