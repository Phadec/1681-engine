import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { blendPose, overlay, upperOver } from './poseMath.ts';
import type { RigDef, RigPose } from './rigTypes.ts';
import { Skeleton } from './Skeleton.ts';

const def = JSON.parse(readFileSync(new URL('./humanoid.json', import.meta.url), 'utf8')) as RigDef;
const skeleton = new Skeleton(def);
const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} != ${b}`);

test('bones hang from their parents', () => {
  const j = skeleton.solve({ by: 2, armF: [0, 3, 90, 2] });
  near(j.chest.y, def.chest[1] + 2, 'chest follows by');
  near(j.shoulderF.x, j.chest.x + def.shoulderF[0], 'shoulder on the chest');
  near(j.elbowF.x, j.shoulderF.x + 3, 'upper arm points forward');
  near(j.wristF.x, j.elbowF.x, 'forearm turned 90 degrees from the upper arm');
  near(j.wristF.y, j.elbowF.y + 2, 'forearm points down');
  near(j.forearm, Math.PI / 2, 'forearm direction');
});

test('a bulky body has wider shoulders', () => {
  const thin = skeleton.solve({});
  const bulky = skeleton.solve({}, true);
  near(bulky.shoulderF.x - thin.shoulderF.x, def.bulkyShoulder, 'front shoulder');
  near(thin.shoulderB.x - bulky.shoulderB.x, def.bulkyShoulder, 'back shoulder');
});

test('hips move the legs, not the chest', () => {
  const j = skeleton.solve({ hipDx: 1, hipDy: -2, legF: [90, 2, 0, 2] });
  near(j.hipF.x, def.hipF[0] + 1, 'hip x');
  near(j.ankleF.y, def.hipF[1] - 2 + 4, 'ankle under the moved hip');
  near(j.chest.y, def.chest[1], 'chest stays');
});

test('blending turns the short way and keeps discrete fields until the end', () => {
  const a: RigPose = { by: 0, armF: [170, 2, 0, 2], face: 'blink' };
  const b: RigPose = { by: 2, armF: [-170, 4, 0, 2], face: 'happy' };
  const mid = blendPose(a, b, 0.5);
  near(mid.by!, 1, 'by');
  near(Math.abs(mid.armF![0]), 180, 'angle crosses 180, not 0');
  near(mid.armF![1], 3, 'length');
  assert.equal(mid.face, 'blink');
  assert.equal(blendPose(a, b, 1).face, 'happy');
});

test('an action keeps the running legs and the far arm swing', () => {
  const run: RigPose = { by: -1, legF: [60, 2, 30, 2], armB: [45, 2, 0, 2], trail: 2 };
  const slash: RigPose = { by: 1, armF: [0, 3, 0, 3], legF: [90, 1, 0, 2], armB: [90, 2, 0, 1] };
  const pose = upperOver(slash, run);
  assert.deepEqual(pose.legF, run.legF);
  assert.deepEqual(pose.armB, run.armB);
  assert.deepEqual(pose.armF, slash.armF);
  assert.equal(pose.by, 0);
  assert.equal(pose.trail, 2);
  const bow = upperOver({ ...slash, armBFront: true }, run);
  assert.deepEqual(bow.armB, slash.armB, 'a drawn bow keeps both hands on it');
});

test('overlay only replaces what the top pose sets', () => {
  const pose = overlay({ by: 1, armF: [90, 2, 0, 2], legF: [90, 2, 0, 2] }, { armF: [0, 3, 0, 3] });
  assert.deepEqual(pose.armF, [0, 3, 0, 3]);
  assert.deepEqual(pose.legF, [90, 2, 0, 2]);
  assert.equal(pose.by, 1);
});
