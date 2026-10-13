import { BatchTextureArray } from 'pixi.js';

let patched = false;

/**
 * Pixi 8's `BatchTextureArray.clear` sets `ids[source.uid] = null` instead of deleting the key, and its batches are
 * pooled, so every pooled batch keeps one key for every texture source ever drawn through it — about 70% of what a
 * fight's heap grew by in an hour (Pixi 8.21.0). The replacement deletes the key, which reads the
 * same to Pixi (`checkAndUpdateTexture` treats null and a missing key alike). Applied once, and only while `clear`
 * still has the shape it was written against, so a Pixi that fixed or changed it is left alone.
 */
export function patchPixi(): boolean {
  if (patched) return true;
  const proto = BatchTextureArray.prototype as unknown as { clear: () => void };
  const probe = new BatchTextureArray() as unknown as { ids: unknown; textures: unknown; count: unknown };
  const shaped = typeof proto.clear === 'function' && typeof probe.ids === 'object' && Array.isArray(probe.textures) && typeof probe.count === 'number';
  if (!shaped || !/ids\[[^\]]+\]\s*=\s*null/.test(String(proto.clear))) return false;
  proto.clear = function clear(this: { ids: Record<number, number | null>; textures: ({ uid: number } | null)[]; count: number }): void {
    const ids = this.ids;
    const textures = this.textures;
    for (let i = 0; i < this.count; i++) {
      const t = textures[i];
      textures[i] = null;
      if (t) delete ids[t.uid];
    }
    this.count = 0;
  };
  patched = true;
  return true;
}
