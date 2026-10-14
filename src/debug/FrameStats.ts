/**
 * The last `size` frame times in a ring of numbers: pure, allocation-free, read by the debug overlay's graph and
 * its FPS line. Averages are over the ring, so one long frame shows in `max` without wrecking the FPS shown.
 */
export class FrameStats {
  readonly times: Float32Array;
  private head = 0;
  private filled = 0;

  constructor(readonly size = 120) {
    this.times = new Float32Array(size);
  }

  /** Records one frame's length in ms. */
  push(ms: number): void {
    this.times[this.head] = ms;
    this.head = (this.head + 1) % this.size;
    if (this.filled < this.size) this.filled++;
  }

  get count(): number {
    return this.filled;
  }

  /** The `i`-th frame, oldest first. */
  at(i: number): number {
    return this.times[(this.head - this.filled + i + this.size) % this.size]!;
  }

  get average(): number {
    if (this.filled === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.filled; i++) sum += this.times[i]!;
    return sum / this.filled;
  }

  get max(): number {
    let m = 0;
    for (let i = 0; i < this.filled; i++) if (this.times[i]! > m) m = this.times[i]!;
    return m;
  }

  get fps(): number {
    const avg = this.average;
    return avg > 0 ? 1000 / avg : 0;
  }

  clear(): void {
    this.head = 0;
    this.filled = 0;
  }
}
