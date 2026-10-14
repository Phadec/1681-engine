import type { AsepriteSheet, AsepriteSlice, AsepriteSliceKey } from './asepriteTypes';

/** A slice by name, or undefined. */
export function sliceNamed(sheet: AsepriteSheet, name: string): AsepriteSlice | undefined {
  return sheet.slices.find((s) => s.name === name);
}

/**
 * The key of `slice` in effect on sprite frame `frame`: Aseprite keys a slice on the frame it changes and holds it
 * until the next key, so the last key at or before the frame. Before the first key the slice is not there (undefined).
 */
export function sliceAt(slice: AsepriteSlice, frame = 0): AsepriteSliceKey | undefined {
  let found: AsepriteSliceKey | undefined;
  for (const k of slice.keys) {
    if (k.frame > frame) break;
    found = k;
  }
  return found;
}

/**
 * The 9-slice borders of a key with a centre — how far in from each edge the stretchable middle starts — in the shape
 * Pixi's `NineSliceSprite` and `Texture.defaultBorders` take. Undefined for a key with no centre.
 */
export function sliceBorders(key: AsepriteSliceKey): { left: number; top: number; right: number; bottom: number } | undefined {
  const c = key.center;
  if (!c) return undefined;
  return { left: c.x, top: c.y, right: key.bounds.w - c.x - c.w, bottom: key.bounds.h - c.y - c.h };
}
