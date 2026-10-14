import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Actions, type PadState } from './Actions.ts';
import { InputPlayer, InputRecorder, type InputTape } from './inputTape.ts';

/** Actions on a fake pad a test drives: button 0 is jump, the left stick's x is left/right. */
function rig() {
  const pad: PadState = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] } as never;
  const actions = new Actions<'jump' | 'left' | 'right'>(null, { jump: ['pad:a'], left: ['pad:lx-'], right: ['pad:lx+'] }, { gamepads: () => [pad] });
  return {
    actions,
    set(jump: boolean, x: number) {
      (pad.buttons as { pressed: boolean; value: number }[])[0] = { pressed: jump, value: jump ? 1 : 0 };
      (pad.axes as number[])[0] = x;
    },
  };
}

/** A tiny deterministic "game": a body that walks with the stick and jumps on a press. */
function simulate(actions: Actions<'jump' | 'left' | 'right'>, steps: number, drive: (step: number) => void) {
  const body = { x: 0, jumps: 0, trail: [] as string[] };
  for (let s = 0; s < steps; s++) {
    drive(s);
    actions.poll();
    body.x += actions.axis('left', 'right') * 2;
    if (actions.pressed('jump')) body.jumps++;
    body.trail.push(`${body.x.toFixed(3)}:${body.jumps}`);
    actions.endStep();
  }
  return body;
}

const script = (r: ReturnType<typeof rig>) => (s: number) => {
  r.set(s % 40 < 3 || (s > 100 && s < 104), s < 60 ? 0.8 : s < 90 ? -0.55 : Math.sin(s / 7));
};

test('a tape played back makes the same game, step for step', () => {
  const live = rig();
  const rec = new InputRecorder(live.actions, { seed: 42 });
  const played = simulate(live.actions, 200, script(live));
  const tape = rec.stop();
  assert.equal(tape.steps, 200);
  assert.deepEqual(tape.meta, { seed: 42 });
  // through JSON, as a bug report carries it
  const again = rig();
  const player = new InputPlayer(JSON.parse(JSON.stringify(tape)) as InputTape);
  let ended = 0;
  player.playInto(again.actions, () => ended++);
  // the devices are ignored while it plays: the pad lies untouched
  const replayed = simulate(again.actions, 200, () => undefined);
  // exactly: a stick's value goes through JSON whole
  assert.deepEqual(replayed.trail, played.trail);
  assert.equal(replayed.x, played.x);
  assert.equal(player.done, true);
  assert.equal(ended, 0, 'the end is found on the poll after the last step');
  again.set(true, 0);
  again.actions.poll();
  assert.equal(ended, 1);
  assert.equal(again.actions.replaying, false);
  assert.equal(again.actions.down('jump'), true, 'the devices answer again');
});

test('only changes are kept, so a held input costs nothing per step', () => {
  const r = rig();
  const rec = new InputRecorder(r.actions);
  simulate(r.actions, 300, (s) => r.set(s >= 10 && s < 250, 0));
  const tape = rec.stop();
  assert.deepEqual(tape.changes, [
    [10, 0, 1],
    [250, 0, 0],
  ]);
  assert.deepEqual(tape.actions, ['jump']);
  assert.equal(rec.stop(), tape, 'stopping twice hands back the same tape');
  r.set(true, 1);
  r.actions.poll();
  assert.equal(rec.length, 300, 'nothing is recorded after the stop');
});

test('a replay can be stopped early, and a tape that is not one is refused', () => {
  const r = rig();
  const rec = new InputRecorder(r.actions);
  simulate(r.actions, 10, () => r.set(true, 0));
  const player = new InputPlayer(rec.stop());
  const fresh = rig();
  player.playInto(fresh.actions);
  fresh.actions.poll();
  assert.equal(fresh.actions.down('jump'), true);
  fresh.actions.replay(null);
  fresh.actions.poll();
  assert.equal(fresh.actions.down('jump'), false);
  for (const bad of [null, {}, { version: 2, actions: [], steps: 0, changes: [] }, { version: 1, actions: ['a'], steps: 1, changes: [[0, 5, 1]] }, { version: 1, actions: ['a'], steps: 2, changes: [[1, 0, 1], [0, 0, 0]] }]) {
    assert.throws(() => new InputPlayer(bad as never), /not an input tape/);
  }
});
