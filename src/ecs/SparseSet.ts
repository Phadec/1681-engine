/**
 * One component type's storage: a sparse set. `sparse[index]` is where the entity's value sits in the dense arrays
 * (or -1), and `entities`/`values` are packed with no holes, so walking a component is a walk over two flat arrays
 * and finding one is two array reads. Removing swaps the last entry into the hole.
 *
 * Indexed by the entity's slot index (`entityIndex`), not the whole id: the generation is checked by the world.
 */
export class SparseSet<T> {
  private sparse: Int32Array = new Int32Array(64).fill(-1);
  /** Packed entity ids, in the same order as `values`. */
  readonly entities: number[] = [];
  readonly values: T[] = [];
  /** Bumped whenever an entity joins or leaves the set (not when a value changes): query caches key on it. */
  version = 0;

  get size(): number {
    return this.entities.length;
  }

  has(index: number): boolean {
    return index < this.sparse.length && this.sparse[index]! >= 0;
  }

  /** The value at slot `index`, or undefined. */
  get(index: number): T | undefined {
    if (index >= this.sparse.length) return undefined;
    const d = this.sparse[index]!;
    return d >= 0 ? this.values[d] : undefined;
  }

  set(index: number, entity: number, value: T): void {
    this.grow(index);
    const d = this.sparse[index]!;
    if (d >= 0) {
      this.values[d] = value;
      this.entities[d] = entity;
      return;
    }
    this.sparse[index] = this.entities.length;
    this.version++;
    this.entities.push(entity);
    this.values.push(value);
  }

  /** Removes slot `index`; true if it was there. */
  delete(index: number, indexOf: (entity: number) => number): boolean {
    if (index >= this.sparse.length) return false;
    const d = this.sparse[index]!;
    if (d < 0) return false;
    const last = this.entities.length - 1;
    if (d !== last) {
      const moved = this.entities[last]!;
      this.entities[d] = moved;
      this.values[d] = this.values[last]!;
      this.sparse[indexOf(moved)] = d;
    }
    this.entities.pop();
    this.values.pop();
    this.sparse[index] = -1;
    this.version++;
    return true;
  }

  clear(): void {
    this.version++;
    this.sparse.fill(-1);
    this.entities.length = 0;
    this.values.length = 0;
  }

  private grow(index: number): void {
    if (index < this.sparse.length) return;
    let n = this.sparse.length;
    while (n <= index) n *= 2;
    const next = new Int32Array(n).fill(-1);
    next.set(this.sparse);
    this.sparse = next;
  }
}
