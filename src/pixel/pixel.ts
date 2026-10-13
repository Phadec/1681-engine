/*
 * Minimal pixel-art canvas. All game art is painted procedurally with these primitives
 * (no external/copyrighted assets). Colors are packed little-endian RGBA (ImageData layout).
 */

export type Color = number;

export const CLEAR: Color = 0;

export function rgba(r: number, g: number, b: number, a = 255): Color {
  const R = Math.max(0, Math.min(255, Math.round(r)));
  const G = Math.max(0, Math.min(255, Math.round(g)));
  const B = Math.max(0, Math.min(255, Math.round(b)));
  const A = Math.max(0, Math.min(255, Math.round(a)));
  return ((A << 24) | (B << 16) | (G << 8) | R) >>> 0;
}

export function hex(s: string): Color {
  let h = s.startsWith('#') ? s.slice(1) : s;
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return rgba(r, g, b, a);
}

export function channels(c: Color): [number, number, number, number] {
  return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, (c >>> 24) & 255];
}

/** f < 1 darkens, f > 1 lightens toward white. */
export function shade(c: Color, f: number): Color {
  const [r, g, b, a] = channels(c);
  if (f >= 1) {
    const t = Math.min(1, f - 1);
    return rgba(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t, a);
  }
  return rgba(r * f, g * f, b * f, a);
}

export function mix(c1: Color, c2: Color, t: number): Color {
  const a = channels(c1);
  const b = channels(c2);
  return rgba(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t);
}

export function withAlpha(c: Color, alpha: number): Color {
  const [r, g, b] = channels(c);
  return rgba(r, g, b, alpha);
}

export function toCss(c: Color): string {
  const [r, g, b, a] = channels(c);
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}

export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}




export class PixelGrid {
  readonly data: Uint32Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint32Array(w * h);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  px(x: number, y: number, c: Color): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c;
  }

  get(x: number, y: number): Color {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return CLEAR;
    return this.data[y * this.w + x] ?? CLEAR;
  }

  alphaAt(x: number, y: number): number {
    return this.get(x, y) >>> 24;
  }

  rect(x: number, y: number, w: number, h: number, c: Color): void {
    for (let yy = Math.floor(y); yy < y + h; yy++) for (let xx = Math.floor(x); xx < x + w; xx++) this.px(xx, yy, c);
  }

  hline(x0: number, x1: number, y: number, c: Color): void {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.px(x, y, c);
  }

  vline(x: number, y0: number, y1: number, c: Color): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.px(x, y, c);
  }

  /** Filled ellipse; a pixel is inside when its center lies inside the ellipse. */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color): void {
    if (rx <= 0 || ry <= 0) return;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
  }

  circle(cx: number, cy: number, r: number, c: Color): void {
    this.ellipse(cx, cy, r, r, c);
  }

  ring(cx: number, cy: number, r: number, thickness: number, c: Color): void {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r && d >= r - thickness) this.px(x, y, c);
      }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Color, thickness = 1): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (thickness <= 1) this.px(x0, y0, c);
      else this.rect(x0 - Math.floor((thickness - 1) / 2), y0 - Math.floor((thickness - 1) / 2), thickness, thickness, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Filled polygon (even-odd scanline on pixel centers). */
  poly(points: [number, number][], c: Color): void {
    if (points.length < 3) return;
    const minY = Math.floor(Math.min(...points.map((p) => p[1])));
    const maxY = Math.ceil(Math.max(...points.map((p) => p[1])));
    for (let y = minY; y <= maxY; y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
          xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.ceil(xs[i]! - 0.5); x <= Math.floor(xs[i + 1]! - 0.5); x++) this.px(x, y, c);
      }
    }
  }

  /**
   * Adds `width` pixels of outline around all opaque pixels, one ring at a time — the same result as calling it
   * `width` times, but each ring only visits the neighbours of the ring before it instead of the whole grid again.
   * (A pixel next to ring `k` is always filled by ring `k+1`, so nothing further back can still be waiting.)
   */
  outline(c: Color, diagonal = false, width = 1): void {
    const w = this.w;
    const h = this.h;
    const solid = new Uint8Array(this.data.length);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if ((this.data[i]! >>> 24) === 0) continue;
        solid[i] = 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    if (x1 < 0) return;
    const has = (x: number, y: number, i: number) => x >= 0 && y >= 0 && x < w && y < h && solid[i] === 1;
    // The first ring is one sweep of the box the body actually fills, so its interior never reaches a frontier list.
    let frontier: number[] = [];
    for (let y = Math.max(0, y0 - 1); y <= Math.min(h - 1, y1 + 1); y++)
      for (let x = Math.max(0, x0 - 1); x <= Math.min(w - 1, x1 + 1); x++) {
        const i = y * w + x;
        if (solid[i]) continue;
        let hit = has(x - 1, y, i - 1) || has(x + 1, y, i + 1) || has(x, y - 1, i - w) || has(x, y + 1, i + w);
        if (!hit && diagonal)
          hit = has(x - 1, y - 1, i - w - 1) || has(x + 1, y - 1, i - w + 1) || has(x - 1, y + 1, i + w - 1) || has(x + 1, y + 1, i + w + 1);
        if (hit) {
          this.data[i] = c;
          frontier.push(i);
        }
      }
    for (const i of frontier) solid[i] = 1;
    // Later rings only visit the neighbours of the ring before them.
    for (let step = 1; step < width && frontier.length; step++) {
      const next: number[] = [];
      for (const i of frontier) {
        const x = i % w;
        const y = (i / w) | 0;
        const grow = (nx: number, ny: number, k: number) => {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || solid[k]) return;
          solid[k] = 1;
          this.data[k] = c;
          next.push(k);
        };
        grow(x - 1, y, i - 1);
        grow(x + 1, y, i + 1);
        grow(x, y - 1, i - w);
        grow(x, y + 1, i + w);
        if (diagonal) {
          grow(x - 1, y - 1, i - w - 1);
          grow(x + 1, y - 1, i - w + 1);
          grow(x - 1, y + 1, i + w - 1);
          grow(x + 1, y + 1, i + w + 1);
        }
      }
      frontier = next;
    }
  }

  /** Replaces every pixel whose color matches `from`. */
  recolor(from: Color, to: Color): void {
    for (let i = 0; i < this.data.length; i++) if (this.data[i] === from) this.data[i] = to;
  }

  /** Multiplies brightness of opaque pixels matching `pred`. */
  tint(f: number, pred: (x: number, y: number) => boolean): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        const c = this.data[i] ?? 0;
        if (c >>> 24 && pred(x, y)) this.data[i] = shade(c, f);
      }
  }

  blit(src: PixelGrid, dx: number, dy: number, flipX = false): void {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.data[y * src.w + x] ?? 0;
        if (c >>> 24 === 0) continue;
        this.px(dx + (flipX ? src.w - 1 - x : x), dy + y, c);
      }
  }

  /** Alpha-blends a color onto an existing pixel. */
  blend(x: number, y: number, c: Color): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.w + x;
    const dst = this.data[i] ?? 0;
    const [r, g, b, a] = channels(c);
    const t = a / 255;
    const d = channels(dst);
    this.data[i] = rgba(d[0] + (r - d[0]) * t, d[1] + (g - d[1]) * t, d[2] + (b - d[2]) * t, Math.max(d[3], a));
  }

  /** Reads a canvas back into a grid (a PNG layer of the paper doll joining the painted ones). */
  static from(canvas: HTMLCanvasElement): PixelGrid {
    const g = new PixelGrid(canvas.width, canvas.height);
    const img = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    g.data.set(new Uint32Array(img.data.buffer, img.data.byteOffset, canvas.width * canvas.height));
    return g;
  }

  /** The same picture on a grid `factor` times as fine, each pixel becoming a square block. */
  upscaled(factor: number): PixelGrid {
    if (factor === 1) return this;
    const g = new PixelGrid(this.w * factor, this.h * factor);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = this.data[y * this.w + x] ?? 0;
        if (c >>> 24 === 0) continue;
        g.rect(x * factor, y * factor, factor, factor, c);
      }
    return g;
  }

  /** Same size and same pixels. */
  equals(other: PixelGrid): boolean {
    if (other.w !== this.w || other.h !== this.h) return false;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== other.data[i]) return false;
    return true;
  }

  /** Cheap hash of the pixels, for grouping identical frames before comparing them. */
  key(): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < this.data.length; i++) {
      h ^= this.data[i]!;
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  clone(): PixelGrid {
    const g = new PixelGrid(this.w, this.h);
    g.data.set(this.data);
    return g;
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not supported');
    const bytes = new Uint8ClampedArray(this.w * this.h * 4);
    bytes.set(new Uint8Array(this.data.buffer, this.data.byteOffset, this.data.byteLength));
    const img = new ImageData(bytes, this.w, this.h);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

/**
 * A grid that stands for one window of a larger picture: it is drawn on in the larger picture's coordinates and
 * keeps only what falls inside `[x0, x0 + w) × [y0, y0 + h)`. A ground painter can paint a crop of a map into one, so the
 * login screen does not paint the whole of two maps to show 17 tiles of each. Every drawing method goes through
 * `px`/`get`/`inBounds`/`blend`; `outline`, `tint` and the whole-grid helpers work in window coordinates.
 */
export class PixelWindow extends PixelGrid {
  constructor(
    readonly x0: number,
    readonly y0: number,
    w: number,
    h: number,
  ) {
    super(w, h);
  }

  override inBounds(x: number, y: number): boolean {
    return super.inBounds(x - this.x0, y - this.y0);
  }

  override px(x: number, y: number, c: Color): void {
    super.px(Math.floor(x) - this.x0, Math.floor(y) - this.y0, c);
  }

  override get(x: number, y: number): Color {
    return super.get(x - this.x0, y - this.y0);
  }

  override blend(x: number, y: number, c: Color): void {
    // not through super.blend: it asks `this.inBounds`, which would move the point a second time
    const lx = x - this.x0;
    const ly = y - this.y0;
    if (!super.inBounds(lx, ly)) return;
    const i = ly * this.w + lx;
    const dst = this.data[i] ?? 0;
    const [r, g, b, a] = channels(c);
    const t = a / 255;
    const d = channels(dst);
    this.data[i] = rgba(d[0] + (r - d[0]) * t, d[1] + (g - d[1]) * t, d[2] + (b - d[2]) * t, Math.max(d[3], a));
  }
}

/**
 * Packs same-sized frames into rows no wider than `maxWidth`. A browser refuses a canvas past about 16k pixels
 * on a side and hands back a blank one, and a player sheet of six hundred frames at twice the detail is wider
 * than that, so it wraps. Readers work the row out from the canvas width.
 */
export function makeSheet(frames: PixelGrid[], maxWidth = 16384): HTMLCanvasElement {
  const first = frames[0];
  if (!first) throw new Error('makeSheet: no frames');
  const cols = Math.max(1, Math.min(frames.length, Math.floor(maxWidth / first.w)));
  const rows = Math.ceil(frames.length / cols);
  const sheet = new PixelGrid(first.w * cols, first.h * rows);
  frames.forEach((f, i) => sheet.blit(f, (i % cols) * first.w, Math.floor(i / cols) * first.h));
  return sheet.toCanvas();
}

/** Scales a canvas by an integer factor with nearest-neighbour filtering (for UI icons). */
export function upscale(src: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width * factor;
  c.height = src.height * factor;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
