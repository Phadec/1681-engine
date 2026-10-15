import type { Container } from 'pixi.js';
import { BitmapLabel } from './BitmapLabel';
import { Graphics } from './Graphics';
import { Group } from './Group';
import { Image } from './Image';
import { Rectangle } from './Rectangle';
import type { Stage } from './Stage';
import { Text, type TextStyle } from './Text';

/** `scene.add.*`: creates an object and puts it on the world layer, where depth sorts it. */
export class ObjectFactory {
  constructor(private readonly stage: Stage) {}

  image(x: number, y: number, key: string, frame?: string | number): Image {
    return this.attach(new Image(this.stage.textures, x, y, key, frame));
  }

  /**
   * A copy of `src` as it is drawn right now (afterimages, clones). A live texture, repainted every frame, is
   * snapshotted first, and the snapshot is freed with the copy.
   */
  still(x: number, y: number, src: Image): Image {
    const textures = this.stage.textures;
    if (!textures.isLive(src.textureKey)) return this.image(x, y, src.textureKey, src.frameName);
    const key = textures.snapshot(src.textureKey, src.frameName);
    const img = this.image(x, y, key, '0');
    img.once('destroyed', () => textures.remove(key));
    return img;
  }

  graphics(opts?: { x?: number; y?: number }): Graphics {
    const g = this.attach(new Graphics());
    g.position.set(opts?.x ?? 0, opts?.y ?? 0);
    return g;
  }

  container(x = 0, y = 0, children: Container[] = []): Group {
    const c = this.attach(new Group());
    c.position.set(x, y);
    c.add(children);
    return c;
  }

  rectangle(x: number, y: number, w: number, h: number, color: number, alpha = 1): Rectangle {
    const r = this.attach(new Rectangle(w, h, color, alpha));
    r.position.set(x, y);
    return r;
  }

  text(x: number, y: number, text: string, style: TextStyle): Text {
    const t = this.attach(new Text(x, y, text, style));
    this.stage.keepSharp(t);
    return t;
  }

  /** A bitmap-font label (`BitmapLabel`): cheap to change, for text rewritten many times a second. */
  label(x: number, y: number, text: string, fontFamily: string, size: number, color: string, stroke: string, strokeWidth: number, resolution: number, glyphs = ''): BitmapLabel {
    const l = this.attach(new BitmapLabel(x, y, text, fontFamily, size, color, stroke, strokeWidth, resolution, glyphs));
    this.stage.keepSharp(l);
    return l;
  }

  /** Puts an object made elsewhere on the world layer, as the factory's own are (a `PixelLayer`, a custom class). */
  existing<T extends Container & { scene: Stage }>(obj: T): T {
    return this.attach(obj);
  }

  private attach<T extends Container & { scene: Stage }>(obj: T): T {
    obj.scene = this.stage;
    this.stage.world.addChild(obj);
    return obj;
  }
}
