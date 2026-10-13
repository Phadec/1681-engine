import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUMANOID_RIG } from './humanoid.ts';
import { HUMANOID_CLIPS, HUMANOID_POSES } from './humanoidPoses.ts';
import { PosePlayer } from './PosePlayer.ts';
import { Skeleton } from './Skeleton.ts';
import type { RigPose } from './rigTypes.ts';

const A: RigPose = { by: 0, armF: [0, 2, 0, 2] };
const B: RigPose = { by: 2, armF: [90, 2, 0, 2] };
const lib = { A, B };

test('every built-in pose solves to finite joints and every clip names poses that exist', () => {
  const sk = new Skeleton(HUMANOID_RIG);
  for (const [name, pose] of Object.entries(HUMANOID_POSES)) {
    const j = sk.solve(pose);
    for (const [k, v] of Object.entries(j)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${name}.${k}`);
      else assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y), `${name}.${k}`);
    }
  }
  for (const name of Object.keys(HUMANOID_CLIPS)) assert.doesNotThrow(() => new PosePlayer(HUMANOID_POSES, HUMANOID_CLIPS, name as 'idle'), name);
});

test('keys blend: halfway between two keys is halfway between their poses', () => {
  const p = new PosePlayer(lib, { ab: { poses: ['A', 'B'], fps: 10, loop: false } }, 'ab');
  p.update(0.05);
  assert.equal(p.pose.by, 1);
  assert.equal(p.pose.armF![0], 45);
});

test('a looping clip blends its last key back into the first', () => {
  const p = new PosePlayer(lib, { ab: { poses: ['A', 'B'], fps: 10 } }, 'ab');
  p.update(0.15);
  assert.equal(p.pose.by, 1, 'halfway from B back to A');
  p.update(0.1);
  assert.equal(p.pose.by, 1, 'it wrapped round');
});

test('a clip without blend steps from key to key; one that does not loop holds its end and reports once', () => {
  const done: string[] = [];
  const p = new PosePlayer(lib, { step: { poses: ['A', 'B'], fps: 10, blend: false, loop: false } }, 'step');
  p.onComplete = (c) => done.push(c);
  p.update(0.05);
  assert.equal(p.pose.by, 0);
  p.update(0.1);
  assert.equal(p.pose.by, 2);
  p.update(1);
  assert.equal(p.finished, true);
  assert.deepEqual(done, ['step']);
});

test('changing clip fades from the pose shown', () => {
  const p = new PosePlayer(lib, { a: { poses: ['A'] }, b: { poses: ['B'] } }, 'a');
  p.play('b', { fadeMs: 100 });
  assert.equal(p.pose.by, 0, 'the fade starts where it was');
  p.update(0.05);
  assert.equal(p.pose.by, 1);
  p.update(0.06);
  assert.equal(p.pose.by, 2, 'the fade is over');
});

test('an unknown clip or pose is refused when named, not when shown', () => {
  assert.throws(() => new PosePlayer(lib, { x: { poses: ['A', 'C'] } }, 'x'), /no pose "C"/);
  const p = new PosePlayer(lib, { a: { poses: ['A'] } }, 'a');
  assert.throws(() => p.play('z' as 'a'), /no clip "z"/);
});
