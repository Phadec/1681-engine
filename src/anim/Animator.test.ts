import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Animator } from './Animator.ts';

const clips = {
  idle: { frames: [0, 1], fps: 2 },
  walk: { frames: ['w0', 'w1', 'w2', 'w3'], fps: 10 },
  die: { frames: [6, 7, 8], fps: 10, loop: false },
  hit: { frames: [9, 10], durations: [50, 200], loop: false },
};

test('frames advance with time and loop', () => {
  const a = new Animator(clips, 'walk');
  assert.equal(a.frame, 'w0');
  a.update(0.1);
  assert.equal(a.frame, 'w1');
  a.update(0.35);
  assert.equal(a.frame, 'w0', 'four frames on, it is back at the start');
});

test('a big dt skips frames rather than lagging behind', () => {
  const a = new Animator(clips, 'walk');
  a.update(0.25);
  assert.equal(a.frame, 'w2');
});

test('a clip that does not loop holds its last frame, finishes and reports once', () => {
  const a = new Animator(clips, 'idle');
  const done: string[] = [];
  a.onComplete = (c) => done.push(c);
  a.play('die');
  a.update(1);
  assert.equal(a.frame, 8);
  assert.equal(a.finished, true);
  a.update(1);
  assert.deepEqual(done, ['die']);
});

test('playing the clip already playing keeps its place unless restarted', () => {
  const a = new Animator(clips, 'walk');
  a.update(0.2);
  a.play('walk');
  assert.equal(a.frame, 'w2');
  a.play('walk', true);
  assert.equal(a.frame, 'w0');
});

test('per-frame durations override fps, and speed scales time', () => {
  const a = new Animator(clips, 'hit');
  a.update(0.04);
  assert.equal(a.frame, 9);
  a.update(0.02);
  assert.equal(a.frame, 10);
  const b = new Animator(clips, 'walk');
  b.speed = 0.5;
  b.update(0.1);
  assert.equal(b.frame, 'w0', 'half speed needs twice the time');
  b.update(0.1);
  assert.equal(b.frame, 'w1');
});

test('an unknown or empty clip is refused', () => {
  assert.throws(() => new Animator(clips, 'fly' as 'idle'), /no clip "fly"/);
  assert.throws(() => new Animator({ x: { frames: [] } }, 'x'), /has no frames/);
});
