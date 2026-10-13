import { P } from './palette';
import type { PixelGrid } from './pixel';
import { outlineOf } from './ramp';

/*
 * The selective outline ("selout") round an assembled body. It lands on exactly the pixels a plain outline would —
 * one ring outside the silhouette per grid pixel of `width` — so nothing about the silhouette changes, only the
 * colour of the ring: where the body turns away from the light (the back, facing left of a body facing right) and
 * where it stands on the ground (under the feet, under an arm) the ring stays full dark; on the lit side (the front
 * and the top of the head and shoulders) it takes the dark tone of the fill it borders (`outlineOf`). A hard black
 * line all round a 20x24 body is a sticker; a line that is the coat's own darkest shade on its lit side is a body.
 */
export function selectiveOutline(g: PixelGrid, width = 1): void {
  const { w, h, data } = g;
  const solid = new Uint8Array(data.length);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++)
      if (data[row + x]! >>> 24) {
        solid[row + x] = 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
  }
  if (x1 < 0) return;
  let frontier: number[] = [];
  for (let y = Math.max(0, y0 - 1); y <= Math.min(h - 1, y1 + 1); y++)
    for (let x = Math.max(0, x0 - 1); x <= Math.min(w - 1, x1 + 1); x++) {
      const i = y * w + x;
      if (solid[i]) continue;
      const above = y > 0 && solid[i - w] === 1;
      const right = x + 1 < w && solid[i + 1] === 1;
      const left = x > 0 && solid[i - 1] === 1;
      const below = y + 1 < h && solid[i + w] === 1;
      if (!(above || right || left || below)) continue;
      // under the body or behind it: full dark; in front of it or over it: the fill's own darkest tone
      data[i] = above || right ? P.outline : outlineOf(data[left ? i - 1 : i + w]!);
      frontier.push(i);
    }
  for (const i of frontier) solid[i] = 1;
  // a thicker outline (tools that paint above 1x) grows each ring from the one before it, keeping its colour
  for (let step = 1; step < width && frontier.length; step++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % w;
      const y = (i / w) | 0;
      const c = data[i]!;
      const grow = (ok: boolean, k: number) => {
        if (!ok || solid[k]) return;
        solid[k] = 1;
        data[k] = c;
        next.push(k);
      };
      grow(x > 0, i - 1);
      grow(x + 1 < w, i + 1);
      grow(y > 0, i - w);
      grow(y + 1 < h, i + w);
    }
    frontier = next;
  }
}
