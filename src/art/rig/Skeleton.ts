import type { Joints, Limb, Point, RigDef, RigPose } from './rigTypes';

const RAD = Math.PI / 180;
const DOWN: Limb = [90, 2, 0, 2];

function add(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy };
}

/** Elbow and wrist (or knee and ankle) of a limb hung from `root`. */
function chain(root: Point, limb: Limb): [Point, Point, number] {
  const [a1, l1, a2, l2] = limb;
  const upper = a1 * RAD;
  const lower = (a1 + a2) * RAD;
  const mid = add(root, Math.cos(upper) * l1, Math.sin(upper) * l1);
  return [mid, add(mid, Math.cos(lower) * l2, Math.sin(lower) * l2), lower];
}

/** Turns a pose (bone angles and lengths) into joint positions on the character's 20x24 grid. */
export class Skeleton {
  private readonly def: RigDef;

  constructor(def: RigDef) {
    this.def = def;
  }

  solve(pose: RigPose, bulky = false): Joints {
    const d = this.def;
    const wide = bulky ? d.bulkyShoulder : 0;
    const chest = { x: d.chest[0], y: d.chest[1] + (pose.by ?? 0) };
    const shoulderF = add(chest, d.shoulderF[0] + wide, d.shoulderF[1]);
    const shoulderB = add(chest, d.shoulderB[0] - wide, d.shoulderB[1]);
    const hx = pose.hipDx ?? 0;
    const hy = pose.hipDy ?? 0;
    const hipF = { x: d.hipF[0] + hx, y: d.hipF[1] + hy };
    const hipB = { x: d.hipB[0] + hx, y: d.hipB[1] + hy };
    const [elbowF, wristF, forearm] = this.frontArm(shoulderF, pose.armF ?? DOWN);
    const [elbowB, wristB] = chain(shoulderB, pose.armB ?? DOWN);
    const [kneeF, ankleF] = chain(hipF, pose.legF ?? DOWN);
    const [kneeB, ankleB] = chain(hipB, pose.legB ?? DOWN);
    const head = add(chest, pose.headDx ?? 0, pose.headDy ?? 0);
    return { chest, head, shoulderF, elbowF, wristF, shoulderB, elbowB, wristB, hipF, kneeF, ankleF, hipB, kneeB, ankleB, forearm };
  }

  /**
   * Elbow, wrist and forearm direction of the front arm (or of its motion smear) hung from `shoulder`. The fist keeps
   * the frame's last column for its outline: an arm reaching past that (a swing, a thrust, a draw on a bulky body) is
   * pulled back whole, so the forearm — and the weapon laid along it — keeps its angle.
   */
  frontArm(shoulder: Point, limb: Limb): [Point, Point, number] {
    const d = this.def;
    const [elbow, wrist, forearm] = chain(shoulder, limb);
    const over = Math.max(0, wrist.x - (d.width - d.limbWidth - 1));
    return [add(elbow, -over, 0), add(wrist, -over, 0), forearm];
  }
}
