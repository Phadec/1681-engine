import type { Body } from './Body';

/**
 * Broad phase: a uniform grid hashed into a map, each cell listing the bodies whose bounds touch it. A body spans
 * as many cells as its bounds cover, so a long merged floor sits in a row of cells and is still one body.
 *
 * Cells are keyed by their coordinates packed into one number (16 bits each, wrapping): two cells 65,536 cells
 * apart share a list, which only costs a few extra narrow-phase tests, never a missed pair.
 */
export class SpatialHash {
  readonly cellSize: number;
  private readonly inv: number;
  private readonly cells = new Map<number, Body[]>();
  /** Lists emptied by `clear`, kept for reuse so a rebuild every step allocates nothing once warm. */
  private readonly spare: Body[][] = [];

  constructor(cellSize: number) {
    if (!(cellSize > 0)) throw new Error(`SpatialHash: cell size must be positive, got ${cellSize}`);
    this.cellSize = cellSize;
    this.inv = 1 / cellSize;
  }

  static key(cx: number, cy: number): number {
    return ((cx + 0x8000) & 0xffff) * 0x10000 + ((cy + 0x8000) & 0xffff);
  }

  cellOf(v: number): number {
    return Math.floor(v * this.inv);
  }

  clear(): void {
    for (const list of this.cells.values()) {
      list.length = 0;
      this.spare.push(list);
    }
    this.cells.clear();
  }

  insert(body: Body, margin = 0): void {
    const x0 = this.cellOf(body.minX - margin);
    const x1 = this.cellOf(body.maxX + margin);
    const y0 = this.cellOf(body.minY - margin);
    const y1 = this.cellOf(body.maxY + margin);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = SpatialHash.key(cx, cy);
        let list = this.cells.get(k);
        if (!list) {
          list = this.spare.pop() ?? [];
          this.cells.set(k, list);
        }
        list.push(body);
      }
    }
  }

  /** The bodies listed in one cell (undefined when empty). Do not keep or edit the array. */
  at(cx: number, cy: number): readonly Body[] | undefined {
    return this.cells.get(SpatialHash.key(cx, cy));
  }
}
