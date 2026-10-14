import { isOpen, type NavGrid, type TilePoint } from './navGrid';

/**
 * The open tile nearest to (tx, ty) within `maxRadius` rings, or null: a start or a goal inside a rock still gets a
 * route. `ok` narrows what counts (an open tile that is not a door, say). On each ring the closest tile wins, not
 * the first scanned — scanning order once always picked the ring's top-left corner.
 */
export function nearestOpen(
  g: NavGrid,
  tx: number,
  ty: number,
  maxRadius = 12,
  ok: (x: number, y: number) => boolean = (x, y) => isOpen(g, x, y),
): TilePoint | null {
  if (ok(tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r <= maxRadius; r++) {
    let best: TilePoint | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !ok(tx + dx, ty + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { x: tx + dx, y: ty + dy };
        }
      }
    if (best) return best;
  }
  return null;
}
