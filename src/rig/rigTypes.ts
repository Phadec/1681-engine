/**
 * A limb of two bones: [upper angle, upper length, lower angle relative to the upper, lower length]. Angles in
 * degrees in sprite space of a character facing right (0 = forward, 90 = down), lengths in grid pixels.
 */
export type Limb = [number, number, number, number];

export type Face = 'blink' | 'happy' | 'tired' | 'dizzy';

/**
 * A pose of the humanoid rig (a JSON object of bone angles). Every field is optional: a pose that leaves one
 * out takes it from the pose it is laid over (a guard only moves the weapon arm, an attack keeps the running legs).
 */
export interface RigPose {
  /** Pixels the chest (torso, head, shoulders) sits below its rest height; negative rises. */
  by?: number;
  armF?: Limb;
  armB?: Limb;
  legF?: Limb;
  legB?: Limb;
  /** Offset of both hips from their rest place. */
  hipDx?: number;
  hipDy?: number;
  /** Offset of the head from the chest. */
  headDx?: number;
  headDy?: number;
  face?: Face;
  /** The head faces backwards. */
  lookBack?: boolean;
  /** Pixels the cape and ponytail stream behind while running. */
  trail?: number;
  /** Chest expansion and delayed cloth sway of the breathing cycle. */
  breathe?: boolean;
  sway?: number;
  /** The far arm crosses in front of the body (drawing a bow with both hands). */
  armBFront?: boolean;
  /** Arm the front arm just swept through, left as a translucent smear. */
  smearArm?: Limb;
  /** Tumbling: the torso is a curled ball centred here (grid pixels) instead of standing. */
  curl?: [number, number];
}

/** The rig's proportions (`rig/humanoid.json`), in grid pixels of the 20x24 character frame. */
export interface RigDef {
  /** Art pixels per grid pixel of the rendered body. */
  scale: number;
  width: number;
  height: number;
  /** Top centre of the torso at rest. */
  chest: [number, number];
  shoulderF: [number, number];
  shoulderB: [number, number];
  /** How much further out both shoulders sit on a bulky body. */
  bulkyShoulder: number;
  hipF: [number, number];
  hipB: [number, number];
  /** Thickness of the arms and legs. */
  limbWidth: number;
  /** Brightness of the far leg and the far arm, which stand in the torso's shadow. */
  backShade: number;
  backArmShade: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Joint positions of one solved pose, in grid pixels (fractional). */
export interface Joints {
  chest: Point;
  head: Point;
  shoulderF: Point;
  elbowF: Point;
  wristF: Point;
  shoulderB: Point;
  elbowB: Point;
  wristB: Point;
  hipF: Point;
  kneeF: Point;
  ankleF: Point;
  hipB: Point;
  kneeB: Point;
  ankleB: Point;
  /** Direction the front forearm points (radians, sprite space facing right): the line a held weapon follows. */
  forearm: number;
}
