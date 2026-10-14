/**
 * A binary min-heap of (index, priority) pairs, kept as two parallel arrays so a search over a big grid pushes
 * numbers, not objects. A stale entry (pushed again at a lower priority) is left in and skipped by the caller's
 * closed set, which is cheaper than a decrease-key.
 */
export class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(index: number, priority: number): void {
    const a = this.items;
    const p = this.prio;
    a.push(index);
    p.push(priority);
    let c = a.length - 1;
    while (c > 0) {
      const u = (c - 1) >> 1;
      if (p[u]! <= p[c]!) break;
      [a[u], a[c]] = [a[c]!, a[u]!];
      [p[u], p[c]] = [p[c]!, p[u]!];
      c = u;
    }
  }

  /** The index with the lowest priority, removed. Only call while `size > 0`. */
  pop(): number {
    const a = this.items;
    const p = this.prio;
    const top = a[0]!;
    const lastI = a.pop()!;
    const lastF = p.pop()!;
    if (a.length > 0) {
      a[0] = lastI;
      p[0] = lastF;
      let u = 0;
      for (;;) {
        const l = u * 2 + 1;
        const r = l + 1;
        let s = u;
        if (l < a.length && p[l]! < p[s]!) s = l;
        if (r < a.length && p[r]! < p[s]!) s = r;
        if (s === u) break;
        [a[u], a[s]] = [a[s]!, a[u]!];
        [p[u], p[s]] = [p[s]!, p[u]!];
        u = s;
      }
    }
    return top;
  }

  clear(): void {
    this.items.length = 0;
    this.prio.length = 0;
  }
}
