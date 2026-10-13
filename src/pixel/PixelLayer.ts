import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import { Graphics } from '../core/Graphics';
import { patchPixi } from '../core/pixiPatches';
import type { Stage } from '../core/Stage';

patchPixi();

/** Larger than this a frame is laid as rects after all: a texture that size is no saving. */
const MAX_SIDE = 1024;
/**
 * The sides a buffer is made in, each about a third to a half over the last: a layer that swells frame by frame
 * crosses a handful of them, not one every 32 px, and a spent buffer fits the next layer of its class (`POOL`).
 */
const SIDES = [16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024];
/** Spent buffers kept per size class, and in all, for the next layers to take instead of making a texture. */
const POOL_PER_CLASS = 24;
const POOL_MAX_BYTES = 24 * 1024 * 1024;
/** A layer whose frames have stayed this many presents well inside a quarter of its buffer trades it for a smaller one. */
const SHRINK_AFTER = 60;

/** One buffer, the texture over it, and its size: what a layer holds and the pool keeps. */
interface Surface {
  pixels: Uint8Array;
  words: Uint32Array;
  source: BufferImageSource;
  texture: Texture;
  capW: number;
  capH: number;
}

const POOL = new Map<number, Surface[]>();
let pooledBytes = 0;
/** Textures made since boot (`PixelLayer.stats`): the pool is working when this stops climbing. */
let made = 0;

const sideFor = (n: number): number => {
  for (const s of SIDES) if (s >= n) return s;
  return Math.ceil(n / 256) * 256;
};
const classOf = (w: number, h: number) => w * 4096 + h;

function takeSurface(capW: number, capH: number): Surface {
  // the exact class, else the smallest pooled one that holds it within twice its area: a 48×24 frame takes a spent
  // 48×32 rather than making a texture of its own
  let list = POOL.get(classOf(capW, capH));
  if (!list?.length) {
    let best = Infinity;
    for (const [k, l] of POOL) {
      if (!l.length) continue;
      const w = Math.floor(k / 4096);
      const h = k % 4096;
      const area = w * h;
      if (w >= capW && h >= capH && area <= capW * capH * 2 && area < best) {
        best = area;
        list = l;
      }
    }
  }
  const hit = list?.pop();
  if (hit) {
    pooledBytes -= hit.pixels.byteLength;
    return hit;
  }
  made++;
  const pixels = new Uint8Array(capW * capH * 4);
  const source = new BufferImageSource({
    resource: pixels,
    width: capW,
    height: capH,
    format: 'rgba8unorm',
    alphaMode: 'premultiplied-alpha',
    scaleMode: 'nearest',
  });
  return { pixels, words: new Uint32Array(pixels.buffer), source, texture: new Texture({ source }), capW, capH };
}

function giveSurface(s: Surface): void {
  const key = classOf(s.capW, s.capH);
  let list = POOL.get(key);
  if (!list) POOL.set(key, (list = []));
  if (list.length >= POOL_PER_CLASS || pooledBytes + s.pixels.byteLength > POOL_MAX_BYTES) {
    s.texture.destroy(true);
    return;
  }
  list.push(s);
  pooledBytes += s.pixels.byteLength;
}

/**
 * A `Graphics` for the pixel effects: every `fillRect` of a frame is written into a small RGBA buffer
 * and shown as **one** sprite, instead of becoming a rect Pixi must tessellate, batch and upload. An effect's frame is
 * hundreds to thousands of one-pixel runs (a poison cloud, a status mark round every body in a pack), and as rects they
 * were most of a fight's CPU on a phone (profiled). The pixels are the same: whole
 * world pixels, a translucent fill blended over what was painted before it in the same frame, as a Graphics did.
 *
 * Paint between `clear()` and `present()`; anything other than `fillStyle`/`fillRect` still draws through the
 * Graphics underneath, so a painter using another shape keeps working. Solid pixels may also be **staged**
 * (`stage`, from `pixelTone`'s batch) and laid in one go by `commit`, which is what a batch's flush does.
 *
 * Buffers and their textures are pooled by size class (a texture per effect ran to ~114 a second in a busy fight,
 * and each one stayed in Pixi's batch tables), so a destroyed layer hands its texture
 * to the next one; `PixelLayer.drainPool` lets them all go when the map changes.
 */
/** A new `PixelLayer` on the stage's world layer. */
export function addPixelLayer(stage: Stage): PixelLayer {
  return stage.add.existing(new PixelLayer());
}

export class PixelLayer extends Graphics {
  /** This frame's rects: x, y, w, h, colour, alpha — six numbers each. */
  private readonly rects: number[] = [];
  /** Staged solid runs not yet committed: x, y, w, colour — four numbers each; later ones win. */
  private readonly staged: number[] = [];
  private ink = 0xffffff;
  private inkAlpha = 1;
  private readonly sprite = new Sprite(Texture.EMPTY);
  private surface: Surface | null = null;
  /** Where the buffer's first pixel sits in the layer, as of the last `present`. */
  private originX = 0;
  private originY = 0;
  /** The last frame's size, and how many presents in a row it stayed well inside a quarter of the buffer. */
  private lastW = 0;
  private lastH = 0;
  private small = 0;

  constructor() {
    super();
    this.sprite.visible = false;
    this.addChild(this.sprite);
  }

  /** Textures made, spent buffers waiting in the pool and their bytes (the leak tools read it). */
  static stats(): { made: number; pooled: number; pooledBytes: number } {
    let pooled = 0;
    for (const l of POOL.values()) pooled += l.length;
    return { made, pooled, pooledBytes };
  }

  /** Lets every pooled buffer go (the world changed map): the next map's effects start a pool of their own. */
  static drainPool(): void {
    for (const list of POOL.values()) for (const s of list) s.texture.destroy(true);
    POOL.clear();
    pooledBytes = 0;
  }

  override fillStyle(color: number, alpha = 1): this {
    this.ink = color;
    this.inkAlpha = alpha;
    return super.fillStyle(color, alpha);
  }

  override fillRect(x: number, y: number, w: number, h: number): this {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const rw = Math.round(x + w) - x0;
    const rh = Math.round(y + h) - y0;
    if (rw > 0 && rh > 0 && this.inkAlpha > 0) this.rects.push(x0, y0, rw, rh, this.ink, this.inkAlpha);
    return this;
  }

  /** `fillStyle` + `fillRect` on whole pixels in one call, leaving the fill style alone (a hot loop's way in). */
  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    // a coordinate off to Infinity or NaN would make the frame's box endless (`present`), so it is dropped here
    if (w > 0 && h > 0 && alpha > 0 && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h)) this.rects.push(x, y, w, h, color, alpha);
  }

  /**
   * A solid run of `w` whole pixels at (x, y) in `color`, held until `commit` lays every staged run in the order given
   * (the later winning where they cross), after whatever was drawn before the commit. What `pixelTone`'s batch writes
   * instead of filing each pixel in a map and sorting it into rects.
   */
  stage(x: number, y: number, w: number, color: number): void {
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w)) this.staged.push(x, y, w, color);
  }

  /** Lays the staged runs, as opaque rects, after everything drawn so far. */
  commit(): void {
    const s = this.staged;
    const n = s.length;
    if (n === 0) return;
    const r = this.rects;
    for (let i = 0; i < n; i += 4) r.push(s[i]!, s[i + 1]!, s[i + 2]!, 1, s[i + 3]!, 1);
    s.length = 0;
  }

  override clear(): this {
    this.rects.length = 0;
    this.staged.length = 0;
    return super.clear();
  }

  /** How far the last frame reached from the layer's origin, in world pixels (0 when nothing showed). */
  reach(): number {
    if (!this.sprite.visible) return 0;
    return Math.max(Math.abs(this.originX), Math.abs(this.originY), Math.abs(this.originX + this.lastW), Math.abs(this.originY + this.lastH));
  }

  /** Writes this frame's rects into the texture and shows it; call once the frame is painted. */
  present(): void {
    this.commit();
    const r = this.rects;
    if (r.length === 0) {
      this.sprite.visible = false;
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < r.length; i += 6) {
      if (r[i]! < minX) minX = r[i]!;
      if (r[i + 1]! < minY) minY = r[i + 1]!;
      if (r[i]! + r[i + 2]! > maxX) maxX = r[i]! + r[i + 2]!;
      if (r[i + 1]! + r[i + 3]! > maxY) maxY = r[i + 1]! + r[i + 3]!;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (w > MAX_SIDE || h > MAX_SIDE) {
      this.sprite.visible = false;
      // the Graphics' own fillRect, never chained off `super.fillStyle(…)`: that returns `this`, so `.fillRect` was this
      // class's, which pushed every rect back onto `r` while it was walked — the loop never ended and grew the array to
      // a gigabyte (a body evaporating far across the screen froze PCs for seconds and killed mobile web views)
      const n = r.length;
      for (let i = 0; i < n; i += 6) {
        super.fillStyle(r[i + 4]!, r[i + 5]!);
        super.fillRect(r[i]!, r[i + 1]!, r[i + 2]!, r[i + 3]!);
      }
      return;
    }
    const surface = this.fit(w, h);
    const { words, pixels, capW: cap } = surface;
    // the whole buffer: the sprite always shows all of it at one texel a world pixel. Cropping the texture's frame to
    // this frame's size instead stretched it to the old size (a Pixi sprite is sized by `orig`), and an effect that
    // shrank — a falling column — came down as blocks blown up several times over
    words.fill(0);
    for (let i = 0; i < r.length; i += 6) {
      const x0 = r[i]! - minX;
      const y0 = r[i + 1]! - minY;
      const rw = r[i + 2]!;
      const rh = r[i + 3]!;
      const c = r[i + 4]!;
      const a = r[i + 5]!;
      const cr = (c >> 16) & 255;
      const cg = (c >> 8) & 255;
      const cb = c & 255;
      if (a >= 1) {
        // little-endian RGBA bytes, opaque: no blend
        const word = (0xff000000 | (cb << 16) | (cg << 8) | cr) >>> 0;
        if (rw === 1 && rh === 1) {
          words[y0 * cap + x0] = word;
          continue;
        }
        for (let y = y0; y < y0 + rh; y++) {
          const row = y * cap + x0;
          if (rw < 8) for (let p = row, end = row + rw; p < end; p++) words[p] = word;
          else words.fill(word, row, row + rw);
        }
        continue;
      }
      // premultiplied source-over, what a translucent Graphics fill did over the pixels under it
      const keep = 1 - a;
      const pr = cr * a;
      const pg = cg * a;
      const pb = cb * a;
      const pa = 255 * a;
      for (let y = y0; y < y0 + rh; y++) {
        for (let p = (y * cap + x0) * 4, end = p + rw * 4; p < end; p += 4) {
          pixels[p] = pr + pixels[p]! * keep;
          pixels[p + 1] = pg + pixels[p + 1]! * keep;
          pixels[p + 2] = pb + pixels[p + 2]! * keep;
          pixels[p + 3] = pa + pixels[p + 3]! * keep;
        }
      }
    }
    surface.source.update();
    this.sprite.texture = surface.texture;
    this.sprite.position.set(minX, minY);
    this.sprite.visible = true;
    this.originX = minX;
    this.originY = minY;
    this.lastW = w;
    this.lastH = h;
  }

  /**
   * Shows `other`'s last frame instead of painting one: its texture, placed where it placed it. A frame shared by
   * several bodies (the same aura on two bodies) is painted once and shown by each of their layers.
   */
  mirror(other: PixelLayer): void {
    const s = other.surface;
    if (!s || !other.sprite.visible) {
      this.hideMirror();
      return;
    }
    this.sprite.texture = s.texture;
    this.sprite.position.set(other.originX, other.originY);
    this.sprite.visible = true;
    this.originX = other.originX;
    this.originY = other.originY;
    this.lastW = other.lastW;
    this.lastH = other.lastH;
  }

  /** Shows nothing and lets go of the texture a `mirror` showed. */
  hideMirror(): void {
    this.sprite.visible = false;
    this.sprite.texture = this.surface?.texture ?? Texture.EMPTY;
  }

  /** The premultiplied [r, g, b, a] last presented at layer pixel (x, y); zeros where nothing was (tests read it). */
  pixelAt(x: number, y: number): [number, number, number, number] {
    const s = this.surface;
    const capW = s?.capW ?? 0;
    const capH = s?.capH ?? 0;
    // the sprite must show the buffer one texel to a world pixel, or every pixel read here lands somewhere else
    if (this.sprite.width !== capW || this.sprite.height !== capH) throw new Error('PixelLayer sprite is scaled');
    const px = x - this.originX;
    const py = y - this.originY;
    if (!s || !this.sprite.visible || px < 0 || py < 0 || px >= capW || py >= capH) return [0, 0, 0, 0];
    const p = (py * capW + px) * 4;
    return [s.pixels[p]!, s.pixels[p + 1]!, s.pixels[p + 2]!, s.pixels[p + 3]!];
  }

  /** The buffer's size (tests read it). */
  capacity(): { w: number; h: number } {
    return { w: this.surface?.capW ?? 0, h: this.surface?.capH ?? 0 };
  }

  /**
   * A buffer at least `w` × `h`: grown a size class at a time and kept while it fits, traded back to the pool for a
   * smaller one only once the frames have stayed well inside it for `SHRINK_AFTER` presents (a long-lived layer — an
   * aura, a status mark — that once swelled would otherwise hold and upload its largest buffer for good).
   */
  private fit(w: number, h: number): Surface {
    const s = this.surface;
    if (s && w <= s.capW && h <= s.capH) {
      const roomy = s.capW * s.capH >= 128 * 128 && w * 4 <= s.capW && h * 4 <= s.capH;
      this.small = roomy ? this.small + 1 : 0;
      if (this.small < SHRINK_AFTER) return s;
    }
    this.small = 0;
    // growing keeps the larger side it had, so a frame that swells one way and then the other is not traded each time
    const grow = !!s && (w > s.capW || h > s.capH);
    const capW = sideFor(Math.max(1, w, grow ? s!.capW : 0));
    const capH = sideFor(Math.max(1, h, grow ? s!.capH : 0));
    this.dropSurface();
    const next = takeSurface(capW, capH);
    this.surface = next;
    this.sprite.texture = next.texture;
    return next;
  }

  private dropSurface(): void {
    this.sprite.texture = Texture.EMPTY;
    if (this.surface) giveSurface(this.surface);
    this.surface = null;
  }

  override destroy(): void {
    if (this.destroyed) return;
    this.dropSurface();
    super.destroy();
  }
}
