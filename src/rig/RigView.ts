import { Container, Graphics, Sprite } from 'pixi.js';
import type { TextureRegistry } from '../core/TextureRegistry';
import { Skeleton } from './Skeleton';
import type { Joints, Point, RigDef, RigPose } from './rigTypes';

/** The parts a humanoid rig is drawn with, back to front in this order. */
export const RIG_PARTS = ['upperArmB', 'forearmB', 'thighB', 'shinB', 'torso', 'thighF', 'shinF', 'head', 'upperArmF', 'forearmF'] as const;
export type RigPart = (typeof RIG_PARTS)[number];

/**
 * How one part looks. A textured part is an image drawn with its top-centre on the bone's root joint and turned to
 * follow the bone (cut-out animation, any art style); a vector part is a capsule (limbs), a rounded box (torso) or a
 * circle (head) in `color`.
 */
export interface PartSkin {
  /** Texture key (and frame) in the stage's registry; leave out for a vector part. */
  texture?: string;
  frame?: string | number;
  /** Stretch the image along the bone to the next joint instead of drawing it at its own size. */
  stretch?: boolean;
  /** Where on the image the root joint sits, as a share of its size (default 0.5, 0). */
  anchorX?: number;
  anchorY?: number;
  /** Vector fill (default by part). */
  color?: number;
  /** Vector thickness in grid px (default the rig's `limbWidth`; the torso's width; the head's diameter). */
  width?: number;
  /** Vector outline colour, or null for none (default a dark outline). */
  outline?: number | null;
}

export type RigSkin = Partial<Record<RigPart, PartSkin>>;

export interface RigViewOptions {
  /** World px per grid px (default 1). */
  scale?: number;
  /** Head radius in grid px (default 5) and how far above the chest point its centre sits (default 5.5). */
  headRadius?: number;
  headRise?: number;
  /** A broader build: shoulders set wider. */
  bulky?: boolean;
}

const DEFAULT_COLORS: Record<RigPart, number> = {
  upperArmB: 0x6a90d0,
  forearmB: 0xf0c8a0,
  thighB: 0x3a3048,
  shinB: 0x3a3048,
  torso: 0x4a6fb0,
  thighF: 0x3a3048,
  shinF: 0x3a3048,
  head: 0xf0c8a0,
  upperArmF: 0x6a90d0,
  forearmF: 0xf0c8a0,
};

const BACK = new Set<RigPart>(['upperArmB', 'forearmB', 'thighB', 'shinB']);

/** Which joints each limb part runs between. */
const BONES: Record<Exclude<RigPart, 'torso' | 'head'>, [keyof Joints, keyof Joints]> = {
  upperArmB: ['shoulderB', 'elbowB'],
  forearmB: ['elbowB', 'wristB'],
  thighB: ['hipB', 'kneeB'],
  shinB: ['kneeB', 'ankleB'],
  thighF: ['hipF', 'kneeF'],
  shinF: ['kneeF', 'ankleF'],
  upperArmF: ['shoulderF', 'elbowF'],
  forearmF: ['elbowF', 'wristF'],
};

function shadeOf(color: number, k: number): number {
  const r = Math.round(((color >> 16) & 255) * k);
  const g = Math.round(((color >> 8) & 255) * k);
  const b = Math.round((color & 255) * k);
  return (r << 16) | (g << 8) | b;
}

/**
 * A character drawn from a rig pose: give it a pose each frame (`setPose`, from a `PosePlayer`) and it places every
 * part. The container's origin is the character's feet (bottom centre of the rig's frame); `facing` mirrors it.
 */
export class RigView extends Container {
  private readonly skeleton: Skeleton;
  private readonly sprites = new Map<RigPart, Sprite>();
  private readonly layers = new Map<RigPart, Container>();
  private joints: Joints | null = null;
  private curl: [number, number] | undefined;
  private readonly scaleGrid: number;
  private readonly headRadius: number;
  private readonly headRise: number;
  private readonly bulky: boolean;

  constructor(
    private readonly def: RigDef,
    private readonly skin: RigSkin = {},
    textures?: TextureRegistry,
    options: RigViewOptions = {},
  ) {
    super();
    this.skeleton = new Skeleton(def);
    this.scaleGrid = options.scale ?? 1;
    this.headRadius = options.headRadius ?? 5;
    this.headRise = options.headRise ?? 5.5;
    this.bulky = options.bulky === true;
    // one container per part keeps the back-to-front order whatever mixes sprites and vectors
    const body = new Container();
    body.position.set(-def.width / 2, -def.height);
    this.addChild(body);
    for (const part of RIG_PARTS) {
      const layer = new Container();
      this.layers.set(part, layer);
      body.addChild(layer);
      const s = skin[part];
      if (s?.texture && textures) {
        const sprite = new Sprite(textures.get(s.texture, s.frame));
        sprite.anchor.set(s.anchorX ?? 0.5, s.anchorY ?? 0);
        // images are drawn at the world's scale, while the rig works in grid px
        sprite.scale.set(1 / this.scaleGrid);
        this.sprites.set(part, sprite);
        layer.addChild(sprite);
      }
    }
    // vector parts are drawn into a graphics in their own layer on each pose
    this.scale.set(this.scaleGrid);
  }

  /** 1 faces right, -1 faces left. */
  set facing(dir: 1 | -1) {
    this.scale.x = this.scaleGrid * dir;
  }

  get facing(): 1 | -1 {
    return this.scale.x < 0 ? -1 : 1;
  }

  /** The joints of the last pose, in grid px of the rig's frame (for attaching a held item, an effect). */
  get lastJoints(): Joints | null {
    return this.joints;
  }

  /** Where a joint of the last pose is in this view's parent, in world px. */
  jointInParent(name: keyof Omit<Joints, 'forearm'>): Point | null {
    if (!this.joints) return null;
    const j = this.joints[name];
    return { x: this.x + (j.x - this.def.width / 2) * this.scale.x, y: this.y + (j.y - this.def.height) * this.scale.y };
  }

  setPose(pose: RigPose): this {
    const j = this.skeleton.solve(pose, this.bulky);
    this.joints = j;
    this.curl = pose.curl;
    for (const part of RIG_PARTS) this.place(part, j);
    return this;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    super.destroy(options ?? { children: true });
  }

  private place(part: RigPart, j: Joints): void {
    const layer = this.layers.get(part)!;
    const skin = this.skin[part] ?? {};
    const sprite = this.sprites.get(part);
    const [a, b] = this.ends(part, j);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (sprite) {
      sprite.position.set(a.x, a.y);
      sprite.rotation = angle - Math.PI / 2;
      if (skin.stretch && sprite.texture.height > 0) sprite.scale.y = Math.hypot(b.x - a.x, b.y - a.y) / sprite.texture.height;
      return;
    }
    let g = layer.children[0] as Graphics | undefined;
    if (!g) {
      g = new Graphics();
      layer.addChild(g);
    }
    g.clear();
    const base = skin.color ?? DEFAULT_COLORS[part];
    const color = BACK.has(part) ? shadeOf(base, part.endsWith('ArmB') || part === 'forearmB' ? this.def.backArmShade : this.def.backShade) : base;
    const outline = skin.outline === undefined ? 0x1a1424 : skin.outline;
    const stroke = outline === null ? null : { color: outline, width: 0.6 };
    if (part === 'head') {
      const r = skin.width !== undefined ? skin.width / 2 : this.headRadius;
      g.circle(a.x, a.y, r).fill(color);
      if (stroke) g.stroke(stroke);
      return;
    }
    if (part === 'torso') {
      const w = skin.width ?? Math.abs(this.def.shoulderF[0] - this.def.shoulderB[0]) + 1;
      if (this.curl) {
        g.circle(this.curl[0], this.curl[1], w / 2 + 1).fill(color);
      } else {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        g.roundRect(-w / 2, -0.5, w, len + 1, Math.min(2, w / 3)).fill(color);
        g.position.set(a.x, a.y);
        g.rotation = angle - Math.PI / 2;
        if (stroke) g.stroke(stroke);
        return;
      }
      g.position.set(0, 0);
      g.rotation = 0;
      if (stroke) g.stroke(stroke);
      return;
    }
    const w = skin.width ?? this.def.limbWidth;
    g.position.set(0, 0);
    g.rotation = 0;
    // the outline is a wider line in its colour drawn first, the limb over it
    if (stroke) g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: stroke.color, width: w + stroke.width * 2, cap: 'round' });
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, width: w, cap: 'round' });
  }

  /** The two points a part spans: a limb's joints, the torso from chest to hips, the head's centre (twice). */
  private ends(part: RigPart, j: Joints): [Point, Point] {
    if (part === 'head') {
      const c = { x: j.head.x, y: j.head.y - this.headRise };
      return [c, { x: c.x, y: c.y + 1 }];
    }
    if (part === 'torso') return [j.chest, { x: (j.hipF.x + j.hipB.x) / 2, y: (j.hipF.y + j.hipB.y) / 2 }];
    const [from, to] = BONES[part];
    return [j[from] as Point, j[to] as Point];
  }
}
