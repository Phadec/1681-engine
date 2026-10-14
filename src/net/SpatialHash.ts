/** Cells keyed as one number: column and row each offset into 0..65535, so a world of ±32768 cells fits. */
const OFFSET = 32768;
const key = (cx: number, cy: number) => (cx + OFFSET) * 65536 + (cy + OFFSET);

interface Entry {
  x: number;
  y: number;
  cell: number;
}

/**
 * Points sorted into square cells, for asking who is near a spot without looking at everyone: a room's interest
 * management, a server's hit test. Moving a point within its cell costs a write; across cells, a set delete and add.
 * Pure and transport-free, so the same class serves the client.
 */
export class SpatialHash {
  private readonly cells = new Map<number, Set<number>>();
  private readonly entries = new Map<number, Entry>();

  /** `cellSize`: world px per cell. About the radius queries ask for keeps a query to a 3×3 block. */
  constructor(readonly cellSize: number) {
    if (!(cellSize > 0)) throw new Error(`SpatialHash: cellSize must be above 0 (got ${cellSize})`);
  }

  get size(): number {
    return this.entries.size;
  }

  has(id: number): boolean {
    return this.entries.has(id);
  }

  /** Puts `id` at (x, y), or moves it there. */
  set(id: number, x: number, y: number): void {
    const cell = key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    const e = this.entries.get(id);
    if (e) {
      e.x = x;
      e.y = y;
      if (e.cell === cell) return;
      this.unlink(id, e.cell);
      e.cell = cell;
    } else this.entries.set(id, { x, y, cell });
    let set = this.cells.get(cell);
    if (!set) this.cells.set(cell, (set = new Set()));
    set.add(id);
  }

  delete(id: number): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.unlink(id, e.cell);
    this.entries.delete(id);
  }

  clear(): void {
    this.cells.clear();
    this.entries.clear();
  }

  /** The ids within `radius` of (x, y), edge included, pushed onto `out` in no set order. */
  near(x: number, y: number, radius: number, out: number[] = []): number[] {
    const r2 = radius * radius;
    this.visit(x - radius, y - radius, x + radius, y + radius, (id, e) => {
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= r2) out.push(id);
    });
    return out;
  }

  /** The ids inside the box from (x0, y0) to (x1, y1), edges included. */
  inRect(x0: number, y0: number, x1: number, y1: number, out: number[] = []): number[] {
    this.visit(x0, y0, x1, y1, (id, e) => {
      if (e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1) out.push(id);
    });
    return out;
  }

  private visit(x0: number, y0: number, x1: number, y1: number, fn: (id: number, e: Entry) => void): void {
    const s = this.cellSize;
    const cx0 = Math.floor(x0 / s);
    const cy0 = Math.floor(y0 / s);
    const cx1 = Math.floor(x1 / s);
    const cy1 = Math.floor(y1 / s);
    // a query wider than the world is cheaper as one pass over every point than as a walk over empty cells
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > this.entries.size) {
      for (const [id, e] of this.entries) fn(id, e);
      return;
    }
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const set = this.cells.get(key(cx, cy));
        if (set) for (const id of set) fn(id, this.entries.get(id)!);
      }
  }

  private unlink(id: number, cell: number): void {
    const set = this.cells.get(cell);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) this.cells.delete(cell);
  }
}
