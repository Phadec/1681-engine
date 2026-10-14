import type { Body } from './Body';
import { SpatialHash } from './SpatialHash';

/**
 * Two spatial hashes: static bodies, rebuilt only when they change (a level's ground is thousands of tiles merged
 * into a few hundred boxes and never moves), and everything else, rebuilt every sub-step. Pairs are found from the
 * moving side only: two sleeping or static bodies are never tested against each other.
 */
export class BroadPhase {
  readonly statics: SpatialHash;
  readonly movers: SpatialHash;
  private staticsDirty = true;

  constructor(
    cellSize: number,
    private readonly margin: number,
  ) {
    this.statics = new SpatialHash(cellSize);
    this.movers = new SpatialHash(cellSize);
  }

  markStaticsDirty(): void {
    this.staticsDirty = true;
  }

  /** Re-lists every body; statics only if they changed. Bounds must be current. */
  rebuild(bodies: readonly Body[]): void {
    if (this.staticsDirty) {
      this.statics.clear();
      for (const b of bodies) if (b.isStatic) this.statics.insert(b, this.margin);
      this.staticsDirty = false;
    }
    this.movers.clear();
    for (const b of bodies) if (!b.isStatic) this.movers.insert(b, this.margin);
  }

  /**
   * Calls `visit` once for every pair whose bounds (grown by the margin) overlap and in which at least one body
   * moves. A pair sharing several cells is visited only from the cell holding the corner of their overlap, which
   * needs no set of pairs seen.
   */
  pairs(bodies: readonly Body[], visit: (a: Body, b: Body) => void): void {
    const m = this.margin;
    const hash = this.movers;
    for (const a of bodies) {
      if (!a.moving || !a.inWorld) continue;
      const x0 = hash.cellOf(a.minX - m);
      const x1 = hash.cellOf(a.maxX + m);
      const y0 = hash.cellOf(a.minY - m);
      const y1 = hash.cellOf(a.maxY + m);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const near = this.movers.at(cx, cy);
          if (near) {
            for (const b of near) {
              // two moving bodies meet from the lower id's side only
              if (b === a || (b.moving && b.id < a.id)) continue;
              if (this.owns(a, b, cx, cy)) visit(a, b);
            }
          }
          const ground = this.statics.at(cx, cy);
          if (ground) for (const b of ground) if (this.owns(a, b, cx, cy)) visit(a, b);
        }
      }
    }
  }

  /** The pair overlaps and (cx, cy) is the cell of its overlap's top-left corner. */
  private owns(a: Body, b: Body, cx: number, cy: number): boolean {
    const m = this.margin;
    if (a.maxX + m < b.minX - m || b.maxX + m < a.minX - m || a.maxY + m < b.minY - m || b.maxY + m < a.minY - m) return false;
    const hash = this.movers;
    return hash.cellOf(Math.max(a.minX, b.minX) - m) === cx && hash.cellOf(Math.max(a.minY, b.minY) - m) === cy;
  }
}
