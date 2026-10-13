import type { Limb, RigPose } from './rigTypes';

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/** Shortest turn from angle a to b, in degrees. */
function lerpDeg(a: number, b: number, k: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return a + d * k;
}

function lerpLimb(a: Limb | undefined, b: Limb | undefined, k: number): Limb | undefined {
  if (!a || !b) return k < 1 ? a ?? b : b ?? a;
  return [lerpDeg(a[0], b[0], k), lerp(a[1], b[1], k), lerpDeg(a[2], b[2], k), lerp(a[3], b[3], k)];
}

function lerpOpt(a: number | undefined, b: number | undefined, k: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return lerp(a ?? 0, b ?? 0, k);
}

/**
 * The in-between of two poses at `k` (0 = a, 1 = b): bones turn along the shortest way and stretch, offsets slide.
 * What cannot be in between (face, cape trail, the curled torso) stays `a`'s until `b` is reached.
 */
export function blendPose(a: RigPose, b: RigPose, k: number): RigPose {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const discrete = a;
  return {
    ...discrete,
    by: lerpOpt(a.by, b.by, k),
    armF: lerpLimb(a.armF, b.armF, k),
    armB: lerpLimb(a.armB, b.armB, k),
    legF: lerpLimb(a.legF, b.legF, k),
    legB: lerpLimb(a.legB, b.legB, k),
    hipDx: lerpOpt(a.hipDx, b.hipDx, k),
    hipDy: lerpOpt(a.hipDy, b.hipDy, k),
    headDx: lerpOpt(a.headDx, b.headDx, k),
    headDy: lerpOpt(a.headDy, b.headDy, k),
    smearArm: a.smearArm,
    curl: a.curl && b.curl ? [lerp(a.curl[0], b.curl[0], k), lerp(a.curl[1], b.curl[1], k)] : a.curl,
  };
}

/** `top` laid over `base`: every field `top` sets wins. */
export function overlay(base: RigPose, top: RigPose): RigPose {
  const out: RigPose = { ...base };
  for (const [key, value] of Object.entries(top)) if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  return out;
}

/**
 * An action's upper body over a moving (or seated) body: the arms, head and face act while the legs keep the gait.
 * The chest takes both bobs, but rises at most a pixel so a tall hat keeps its headroom.
 */
export function upperOver(action: RigPose, legs: RigPose): RigPose {
  return {
    ...action,
    by: Math.max(-1, (action.by ?? 0) + (legs.by ?? 0)),
    legF: legs.legF,
    legB: legs.legB,
    hipDx: legs.hipDx,
    hipDy: legs.hipDy,
    // the far arm swings with the run, unless it holds the bow the action draws
    armB: action.armBFront ? action.armB : legs.armB,
    trail: legs.trail ?? action.trail,
  };
}
