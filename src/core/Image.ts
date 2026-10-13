import { Sprite } from 'pixi.js';
import { GameObject } from './gameObject';
import type { TextureRegistry } from './TextureRegistry';

/** A textured sprite, centred by default; frames are looked up by name in the texture registry. */
export class Image extends GameObject(Sprite) {
  textureKey: string;
  frameName: string;

  constructor(
    private readonly registry: TextureRegistry,
    x: number,
    y: number,
    key: string,
    frame?: string | number,
  ) {
    super(registry.get(key, frame));
    this.textureKey = key;
    this.frameName = frame === undefined ? '' : String(frame);
    this.anchor.set(0.5);
    this.position.set(x, y);
  }

  get originX(): number {
    return this.anchor.x;
  }

  get originY(): number {
    return this.anchor.y;
  }

  /** Width of the frame itself, unscaled. */
  get frameWidth(): number {
    return this.texture.orig.width;
  }

  get frameHeight(): number {
    return this.texture.orig.height;
  }

  get displayWidth(): number {
    return Math.abs(this.frameWidth * this.scaleX);
  }

  set displayWidth(w: number) {
    this.scaleX = w / this.frameWidth;
  }

  get displayHeight(): number {
    return Math.abs(this.frameHeight * this.scaleY);
  }

  set displayHeight(h: number) {
    this.scaleY = h / this.frameHeight;
  }

  setOrigin(x = 0.5, y = x): this {
    this.anchor.set(x, y);
    return this;
  }

  setDisplaySize(w: number, h: number): this {
    return this.setScale(w / this.frameWidth, h / this.frameHeight);
  }

  setFrame(frame: string | number): this {
    this.frameName = String(frame);
    this.texture = this.registry.get(this.textureKey, frame);
    return this;
  }

  setTexture(key: string, frame?: string | number): this {
    this.textureKey = key;
    this.frameName = frame === undefined ? '' : String(frame);
    this.texture = this.registry.get(key, frame);
    return this;
  }
}
