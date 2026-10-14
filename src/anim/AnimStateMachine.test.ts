import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimStateMachine } from './AnimStateMachine.ts';

// every frame 100 ms, so a fake clock in tenths of a second lands on whole frames
const clips = {
  idle: { frames: [0, 1], durations: [100, 100] },
  run: { frames: [2, 3, 4, 5], durations: [100, 100, 100, 100] },
  jump: { frames: [6, 7], durations: [100, 100], loop: false },
  fall: { frames: [8], durations: [100] },
  land: { frames: [9, 10], durations: [100, 100], loop: false },
  hurt: { frames: [11], durations: [100], loop: false },
};

function machine(keepTriggers = false) {
  return new AnimStateMachine(clips, {
    initial: 'idle',
    keepTriggers,
    params: { speed: 0, grounded: true, vy: 0, jump: 'trigger', hurt: 'trigger' },
    states: {
      idle: { clip: 'idle' },
      run: { clip: 'run', speedParam: 'speed', markers: [{ frame: 1, name: 'step' }, { frame: 3, name: 'step' }] },
      jump: { clip: 'jump', markers: [{ frame: 0, name: 'whoosh' }] },
      fall: { clip: 'fall' },
      land: { clip: 'land', markers: [{ frame: 0, name: 'thud' }] },
      hurt: { clip: 'hurt' },
    },
    transitions: [
      { from: 'idle', to: 'run', when: { speed: ['>', 0] } },
      { from: 'run', to: 'idle', when: { speed: 0 } },
      { from: ['idle', 'run'], to: 'jump', when: { jump: true, grounded: true } },
      { from: 'jump', to: 'fall', onEnd: true },
      { from: ['jump', 'fall'], to: 'land', when: { grounded: true, vy: ['>=', 0] } },
      { from: 'land', to: 'idle', onEnd: true },
      { from: '*', to: 'hurt', when: { hurt: true }, priority: 10 },
      { from: 'hurt', to: 'idle', exitTime: 3 },
    ],
  });
}

function record(sm: ReturnType<typeof machine>) {
  const log: string[] = [];
  sm.onEvent = (e, s, f) => log.push(`${s}:${e}@${f}`);
  sm.onStateChange = (a, b) => log.push(`${a}>${b}`);
  return log;
}

test('a number condition moves between states and the clip follows', () => {
  const sm = machine();
  assert.equal(sm.state, 'idle');
  sm.set('speed', 1).update(0);
  assert.equal(sm.state, 'run');
  assert.equal(sm.frame, 2);
  sm.set('speed', 0).update(0.1);
  assert.equal(sm.state, 'idle');
});

test('markers fire as playback reaches them, skipped frames included', () => {
  const sm = machine();
  const log = record(sm);
  sm.set('speed', 1).update(0);
  sm.update(0.1);
  assert.deepEqual(log, ['idle>run', 'run:step@1']);
  log.length = 0;
  sm.update(0.25); // from frame 1 past 2 to 3 in one long step
  assert.deepEqual(log, ['run:step@3']);
  log.length = 0;
  sm.update(0.4); // a whole loop in one step: each frame once
  assert.deepEqual(log, ['run:step@1', 'run:step@3']);
});

test('a speed parameter scales the clip and its markers', () => {
  const sm = machine();
  const log = record(sm);
  sm.set('speed', 2).update(0);
  sm.update(0.05); // twice as fast: 50 ms is a frame
  assert.equal(sm.frame, 3);
  assert.deepEqual(log, ['idle>run', 'run:step@1']);
});

test('a trigger is used once, a first-frame marker fires on entry, and on-end waits for the clip', () => {
  const sm = machine();
  const log = record(sm);
  sm.set('grounded', true).trigger('jump').update(0);
  assert.equal(sm.state, 'jump');
  assert.deepEqual(log, ['idle>jump', 'jump:whoosh@0']);
  assert.equal(sm.get('jump'), false, 'used up by the transition');
  sm.set('grounded', false).update(0.1);
  assert.equal(sm.state, 'jump', 'the clip has not finished yet');
  sm.update(0.1);
  assert.equal(sm.state, 'fall');
  sm.set('grounded', true).update(0.016);
  assert.equal(sm.state, 'land');
  sm.update(0.2);
  assert.equal(sm.state, 'idle');
  assert.deepEqual(log.slice(2), ['jump>fall', 'fall>land', 'land:thud@0', 'land>idle']);
});

test('an unused trigger is dropped at the end of the update, unless kept', () => {
  const sm = machine();
  sm.set('grounded', false).trigger('jump').update(0);
  assert.equal(sm.state, 'idle');
  sm.set('grounded', true).update(0);
  assert.equal(sm.state, 'idle', 'the mid-air press did not play out on landing');

  const kept = machine(true);
  kept.set('grounded', false).trigger('jump').update(0);
  kept.set('grounded', true).update(0);
  assert.equal(kept.state, 'jump');
});

test('an any-state transition wins by priority, never restarts itself, and exit time holds it', () => {
  const sm = machine();
  sm.set('speed', 1).update(0);
  sm.trigger('hurt').set('grounded', true).trigger('jump').update(0);
  assert.equal(sm.state, 'hurt', 'priority 10 beats the jump written earlier');
  sm.trigger('hurt').update(0.1);
  assert.equal(sm.state, 'hurt');
  assert.equal(sm.normalizedTime, 1, 'not restarted by its own any-state transition');
  sm.update(0.1);
  assert.equal(sm.state, 'hurt', 'a finished clip keeps counting time toward its exit time');
  sm.update(0.1);
  assert.equal(sm.state, 'idle');
});

test('one transition an update, so a chain takes one update per link', () => {
  const sm = machine();
  sm.trigger('jump').update(0);
  assert.equal(sm.state, 'jump');
  sm.update(10);
  assert.equal(sm.state, 'fall');
});

test('a listener may change state, and later markers of the old clip do not fire', () => {
  const sm = machine();
  const log = record(sm);
  sm.onEvent = (e, s) => {
    log.push(`${s}:${e}`);
    if (e === 'step') sm.set('speed', 0).play('idle');
  };
  sm.set('speed', 1).update(0);
  sm.update(0.4);
  assert.deepEqual(log, ['idle>run', 'run:step', 'run>idle']);
  assert.equal(sm.state, 'idle', "the transitions then checked are the new state's");
});

test('an update with markers and conditions allocates nothing measurable', () => {
  const sm = machine();
  sm.onEvent = () => {};
  sm.set('speed', 1).update(0);
  for (let i = 0; i < 1000; i++) sm.update(0.016); // warm up
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 100_000; i++) {
    sm.set('speed', i % 50 === 0 ? 0 : 1);
    sm.update(0.016);
  }
  const grown = process.memoryUsage().heapUsed - before;
  // 100,000 updates: even 16 bytes each would be 1.6 MB
  assert.ok(grown < 1_000_000, `heap grew ${grown} bytes`);
});

test('a bad definition is refused at construction', () => {
  assert.throws(() => new AnimStateMachine(clips, { initial: 'nope' as 'a', states: { a: { clip: 'idle' } } }), /no state "nope"/);
  assert.throws(() => new AnimStateMachine(clips, { initial: 'a', states: { a: { clip: 'swim' as 'idle' } } }), /clip "swim"/);
  assert.throws(
    () => new AnimStateMachine(clips, { initial: 'a', params: { on: true }, states: { a: { clip: 'idle' } }, transitions: [{ from: 'a', to: 'a', when: { on: ['>', 1] } }] }),
    /not a number/,
  );
  assert.throws(
    () => new AnimStateMachine(clips, { initial: 'a', states: { a: { clip: 'idle' } }, transitions: [{ from: 'a', to: 'a', when: { off: true } as never }] }),
    /not declared/,
  );
  assert.throws(() => new AnimStateMachine(clips, { initial: 'a', states: { a: { clip: 'idle', markers: [{ frame: 5, name: 'x' }] } } }), /past its clip/);
  const sm = machine();
  assert.throws(() => sm.set('jump', true), /use trigger/);
  assert.throws(() => sm.trigger('speed'), /not a trigger/);
});
