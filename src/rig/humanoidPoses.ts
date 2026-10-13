import type { RigPose } from './rigTypes';
import poses from './poses.json';
import type { PoseClip } from './PosePlayer';

/**
 * The built-in humanoid's pose library: 72 poses for `HUMANOID_RIG`, made for a 20×24 character facing right, and
 * clips that string them into motion. Use them as they are, mix them (`overlay`, `upperOver`), or as the starting
 * point for your own.
 */
export const HUMANOID_POSES: Readonly<Record<string, RigPose>> = poses as unknown as Record<string, RigPose>;

const seq = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** Ready-made clips over `HUMANOID_POSES`. Looping clips blend from their last pose back into the first. */
export const HUMANOID_CLIPS = {
  idle: { poses: seq('BREATHE', 6), fps: 6 },
  walk: { poses: seq('STRIDE', 6), fps: 10 },
  run: { poses: seq('JOG', 8), fps: 14 },
  roll: { poses: seq('ROLL', 12), fps: 30, loop: false, blend: false },
  dash: { poses: ['DASH'], fps: 1, loop: false },
  hurt: { poses: ['HURT', 'BREATHE0'], fps: 5, loop: false },
  dizzy: { poses: ['DIZZY', 'BREATHE0'], fps: 2 },
  crouch: { poses: ['CROUCH'], fps: 1, loop: false },
  kneel: { poses: ['KNEEL'], fps: 1, loop: false },
  sit: { poses: ['SIT'], fps: 1, loop: false },
  sitGround: { poses: ['SIT_GROUND'], fps: 1, loop: false },
  pick: { poses: ['CROUCH', 'PICK', 'CROUCH'], fps: 6, loop: false },
  lookBack: { poses: ['LOOK_BACK'], fps: 1, loop: false },
  stretch: { poses: ['BREATHE0', 'STRETCH', 'STRETCH', 'BREATHE0'], fps: 3, loop: false },
  cheer: { poses: ['BREATHE0', 'CHEER', 'CHEER'], fps: 6, loop: false },
  wave: { poses: ['WAVE_A', 'WAVE_B'], fps: 4 },
  dance: { poses: ['DANCE_A', 'DANCE_B'], fps: 3 },
  slash: { poses: ['SLASH_READY', 'SLASH_WIND', 'SLASH_SWEEP', 'SLASH_FOLLOW', 'SLASH_END', 'SLASH_RECOVER'], durations: [60, 90, 40, 60, 90, 120], loop: false },
  thrust: { poses: ['THRUST_READY', 'THRUST_LUNGE', 'THRUST_MID', 'THRUST_END', 'THRUST_RECOVER'], durations: [80, 50, 60, 100, 120], loop: false },
  overhead: { poses: ['OVERHEAD_READY', 'OVERHEAD', 'OVERHEAD_MID', 'OVERHEAD_FALL'], durations: [90, 140, 50, 160], loop: false },
  cast: { poses: ['CAST_CHARGE', 'CAST', 'CAST_RELEASE'], durations: [220, 120, 200], loop: false },
  throw: { poses: ['THROW_READY', 'THROW_WIND', 'THROW_RELEASE', 'THROW_MID', 'THROW_RECOVER'], durations: [70, 110, 40, 70, 120], loop: false },
} satisfies Record<string, PoseClip>;

export type HumanoidClip = keyof typeof HUMANOID_CLIPS;
