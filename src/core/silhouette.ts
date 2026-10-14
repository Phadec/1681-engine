import { CanvasSource, Texture } from 'pixi.js';

/*
 * A body's flat silhouette as a texture of its own, for a hit flash, an afterimage or a shadow copy. The filter way
 * (`setTintFill`, a fill filter) renders every filled body in a pass of its own: an area blow landing on twenty
 * bodies cost twenty passes for a few frames, which dragged a crowded fight down on weak GPUs. A silhouette made once
 * per frame of the atlas is only a texture swap, and every sprite wearing one still batches with the rest.
 *
 * Kept in core, not the pixel module: a hit flash is wanted in any art style, and nothing here assumes a pixel grid.
 * White is the colour to ask for: a white silhouette tinted (`sprite.tint`) is exactly the tint wherever the body is
 * opaque, so one texture per frame serves every colour.
 */

let cache = new WeakMap<Texture, Map<number, Texture>>();
/** Every silhouette made, so `clearSilhouettes()` can free their canvases on the GPU. */
const made = new Set<Texture>();

/**
 * `texture`'s frame with every opaque pixel painted `color` (default white), alpha kept; made once per frame and colour
 * and cached. Only for textures that are never repainted (atlas frames, snapshots): copy a live one first
 * (`TextureRegistry.snapshotInto`) and paint the copy with `fillSolid`. Null when the frame cannot be read (no
 * drawable source, an empty or rotated frame, a cross-origin image).
 */
export function solidSilhouette(texture: Texture, color = 0xffffff): Texture | null {
  let byColor = cache.get(texture);
  const hit = byColor?.get(color);
  if (hit && !hit.destroyed) return hit;
  const resource = texture.source.resource as CanvasImageSource | undefined;
  const f = texture.frame;
  const w = Math.round(f.width);
  const h = Math.round(f.height);
  if (!resource || w <= 0 || h <= 0 || texture.rotate || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.drawImage(resource, Math.round(f.x), Math.round(f.y), w, h, 0, 0, w, h);
  } catch {
    return null;
  }
  fillSolid(canvas, color);
  const out = new Texture({
    source: new CanvasSource({ resource: canvas, scaleMode: texture.source.scaleMode }),
    orig: texture.orig.clone(),
    trim: texture.trim ? texture.trim.clone() : undefined,
  });
  if (!byColor) {
    byColor = new Map();
    cache.set(texture, byColor);
  }
  byColor.set(color, out);
  made.add(out);
  return out;
}

/** Paints every opaque pixel of a canvas `color` (default white), keeping its alpha. Upload the texture after. */
export function fillSolid(canvas: unknown, color = 0xffffff): void {
  const c = canvas as HTMLCanvasElement | OffscreenCanvas | null;
  if (!c || typeof (c as HTMLCanvasElement).getContext !== 'function') return;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
}

/**
 * Frees cached silhouettes: those of one `texture` (it is about to be repainted or destroyed), or all of them (a
 * scene or atlas change). A sprite still wearing one must be given another texture first.
 */
export function clearSilhouettes(texture?: Texture): void {
  if (texture) {
    const byColor = cache.get(texture);
    if (!byColor) return;
    for (const t of byColor.values()) {
      made.delete(t);
      t.destroy(true);
    }
    cache.delete(texture);
    return;
  }
  for (const t of made) t.destroy(true);
  made.clear();
  cache = new WeakMap();
}
