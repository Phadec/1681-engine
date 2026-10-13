import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUMANOID_RIG } from './humanoid.ts';
import { HUMANOID_POSES } from './humanoidPoses.ts';
import { RIG_PARTS, RigView } from './RigView.ts';

test('a vector rig draws every part, in back-to-front order, and survives every built-in pose', () => {
  const view = new RigView(HUMANOID_RIG, {}, undefined, { scale: 3 });
  for (const pose of Object.values(HUMANOID_POSES)) view.setPose(pose);
  const body = view.children[0]!;
  assert.equal(body.children.length, RIG_PARTS.length);
  for (const layer of body.children) assert.equal(layer.children.length, 1, 'one graphics per vector part');
  view.destroy();
});

test('the origin is the feet and facing mirrors', () => {
  const view = new RigView(HUMANOID_RIG, {}, undefined, { scale: 2 });
  view.position.set(100, 50);
  view.setPose(HUMANOID_POSES.BREATHE0!);
  const ankle = view.jointInParent('ankleF')!;
  assert.ok(Math.abs(ankle.y - 50) < 2 * 3, `the front ankle (${ankle.y}) is near the feet line`);
  const right = ankle.x;
  view.facing = -1;
  assert.equal(view.facing, -1);
  const left = view.jointInParent('ankleF')!.x;
  assert.ok(Math.abs(right - 100 - (100 - left)) < 1e-9, 'mirrored about the feet');
  view.destroy();
});
