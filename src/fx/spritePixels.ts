import type { Image } from '../core/Image';

/** One opaque world pixel of a sprite frame: offset from the frame's feet (origin 0.5, 1) and its colour. */
export interface SpritePixel {
  dx: number;
  dy: number;
  color: number;
}

/**
 * A frame's opaque pixels packed in typed arrays (12 bytes a pixel instead of an object each). Iterating hands out one
 * reused `SpritePixel`, so read it in the loop and keep nothing of it; `at(i)` reads one into a given object.
 */
export class PackedPixels implements Iterable<SpritePixel> {
  constructor(
    readonly dx: Float32Array,
    readonly dy: Float32Array,
    readonly color: Uint32Array,
    readonly length: number,
  ) {}

  *[Symbol.iterator](): Iterator<SpritePixel> {
    const p: SpritePixel = { dx: 0, dy: 0, color: 0 };
    for (let i = 0; i < this.length; i++) {
      p.dx = this.dx[i]!;
      p.dy = this.dy[i]!;
      p.color = this.color[i]!;
      yield p;
    }
  }
}

const EMPTY = new PackedPixels(new Float32Array(0), new Float32Array(0), new Uint32Array(0), 0);
/** No pixels: what a body hands over when there is nothing of it worth lifting (a death with nothing to evaporate). */
export const NO_PIXELS = EMPTY;
/**
 * The largest frame read, in image pixels: well over any sheet's (192x180 is about the largest). An image with no frame shows
 * its whole atlas page, and reading that — 4096x3520, 4.4 million pixels, ~110 MB a death — is what took mobile web views
 * down.
 */
const MAX_FRAME_AREA = 512 * 512;
/** Frames kept, the least recently read going first once either bound is passed. */
const MAX_FRAMES = 256;
const MAX_PIXELS = 300_000;
const CACHE = new Map<string, PackedPixels>();
let cachedPixels = 0;

function remember(key: string, packed: PackedPixels): void {
  CACHE.set(key, packed);
  cachedPixels += packed.length;
  while (CACHE.size > MAX_FRAMES || cachedPixels > MAX_PIXELS) {
    const oldest = CACHE.keys().next();
    if (oldest.done) break;
    cachedPixels -= CACHE.get(oldest.value)!.length;
    CACHE.delete(oldest.value);
  }
}

/**
 * The opaque pixels of an image's current frame, one per **world** pixel (`artScale` image pixels to one), as offsets
 * from the frame's feet in unscaled, unflipped world pixels. Read straight off the texture's canvas, so it is the
 * frame actually on screen. Atlas frames are shared by every body of one kind and cached (least recently read out
 * first); a texture repainted while in use (a rig body) is read fresh.
 */
export function spritePixels(img: Image, artScale: number, live: boolean): PackedPixels {
  const cacheKey = `${img.textureKey}|${img.frameName}|${artScale}`;
  if (!live) {
    const hit = CACHE.get(cacheKey);
    if (hit) {
      // most recently read goes to the back
      CACHE.delete(cacheKey);
      CACHE.set(cacheKey, hit);
      return hit;
    }
  }
  const tex = img.texture;
  const canvas = tex.source.resource as unknown;
  if (!(canvas instanceof HTMLCanvasElement)) return EMPTY;
  const f = tex.frame;
  const fw = Math.round(f.width);
  const fh = Math.round(f.height);
  if (fw <= 0 || fh <= 0 || fw * fh > MAX_FRAME_AREA) return EMPTY;
  let data: Uint8ClampedArray;
  try {
    data = canvas.getContext('2d')!.getImageData(Math.round(f.x), Math.round(f.y), fw, fh).data;
  } catch {
    return EMPTY;
  }
  const s = Math.max(1, Math.round(artScale));
  const ww = Math.floor(fw / s);
  const wh = Math.floor(fh / s);
  const half = Math.floor(s / 2);
  let n = 0;
  for (let wy = 0; wy < wh; wy++) for (let wx = 0; wx < ww; wx++) if (data[((wy * s + half) * fw + wx * s + half) * 4 + 3]! >= 128) n++;
  const dx = new Float32Array(n);
  const dy = new Float32Array(n);
  const color = new Uint32Array(n);
  let k = 0;
  for (let wy = 0; wy < wh; wy++) {
    for (let wx = 0; wx < ww; wx++) {
      const i = ((wy * s + half) * fw + wx * s + half) * 4;
      if (data[i + 3]! < 128) continue;
      dx[k] = wx - ww / 2;
      dy[k] = wy - wh;
      color[k] = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
      k++;
    }
  }
  const out = new PackedPixels(dx, dy, color, n);
  if (!live) remember(cacheKey, out);
  return out;
}
