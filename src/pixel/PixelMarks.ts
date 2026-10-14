import type { Graphics } from '../core/Graphics';
import type { Stage } from '../core/Stage';
import { chevronPixels, discRuns, ellipsePixels, type PixelPoint, ringPixels } from './aimPixels';

/** A mark's look: the bright stroke, the rim/edge tone, the dark pixels round it, and a fill for discs. */
export interface MarkTone {
  light: number;
  rim: number;
  dark: number;
  fill: number;
}

export interface PixelMarksOptions<T extends string> {
  /** The looks marks are drawn in, by name (`aim`, `cancel`, `lock`…); every mark names one. */
  tones: Record<T, MarkTone>;
  /** Depth of every mark (default 0): usually just over the effects that lie on the ground. */
  depth?: number;
  /** Headings a chevron is painted for (default 32, 11.25° apart): each is painted once per size and tone. */
  headings?: number;
  /** World pixels between two chevrons of an aim line (default 10). */
  spacing?: number;
  /** How fast the chevrons creep along a line, px per ms (default 0.02), so it reads as a direction. */
  creep?: number;
  /** Opacity of a disc's fill (default 0.28). */
  fillAlpha?: number;
}

function pixels(g: Graphics, px: readonly PixelPoint[], color: number): void {
  g.fillStyle(color, 1);
  for (const [x, y] of px) g.fillRect(x, y, 1, 1);
}

/**
 * Aim and target marks in the world's own pixels: rings, discs and ground ellipses painted once per size and tone and
 * only moved after that, and aim lines as a row of chevrons from a pool — a chevron is repainted only when its heading,
 * size or tone changes. Lines are chevrons, never a solid lane: a solid line of world pixels at most angles is a
 * staircase and reads as broken, while each chevron is crisp at any angle. The drawing side of `AimGesture` and
 * `TargetLock`. Each frame: `begin`, place what the frame needs, then `end`, which hides whatever was shown last frame
 * and not this one.
 */
export class PixelMarks<T extends string = string> {
  private readonly tones: Record<T, MarkTone>;
  private readonly depth: number;
  private readonly headings: number;
  private readonly spacing: number;
  private readonly creep: number;
  private readonly fillAlpha: number;
  private readonly cache = new Map<string, Graphics>();
  private readonly pool: { g: Graphics; key: string }[] = [];
  private used = 0;
  private shown = new Set<Graphics>();
  private next = new Set<Graphics>();

  constructor(
    private readonly stage: Stage,
    options: PixelMarksOptions<T>,
  ) {
    this.tones = options.tones;
    this.depth = options.depth ?? 0;
    this.headings = Math.max(4, Math.round(options.headings ?? 32));
    this.spacing = Math.max(1, options.spacing ?? 10);
    this.creep = options.creep ?? 0.02;
    this.fillAlpha = options.fillAlpha ?? 0.28;
  }

  begin(): void {
    this.used = 0;
    // swapped with `shown` in `end`: two sets reused, none made a frame
    this.next.clear();
  }

  /** A ring of radius `r` round (x, y): the bright line with dark pixels just inside and outside it. */
  ring(x: number, y: number, r: number, tone: T): void {
    const t = this.tones[tone];
    r = Math.max(2, Math.round(r));
    this.place(`ring:${r}:${tone}`, x, y, (g) => {
      pixels(g, ringPixels(r + 1), t.dark);
      pixels(g, ringPixels(Math.max(1, r - 1)), t.dark);
      pixels(g, ringPixels(r), t.light);
    });
  }

  /** A filled disc of radius `r` with a bright rim and a cross at its middle: where a skill aimed at a spot lands. */
  disc(x: number, y: number, r: number, tone: T): void {
    const t = this.tones[tone];
    r = Math.max(2, Math.round(r));
    this.place(`disc:${r}:${tone}`, x, y, (g) => {
      g.fillStyle(t.fill, this.fillAlpha);
      for (const [yy, x0, x1] of discRuns(r)) g.fillRect(x0, yy, x1 - x0 + 1, 1);
      pixels(g, ringPixels(r + 1), t.dark);
      pixels(g, ringPixels(r), t.rim);
      g.fillStyle(t.light, 1).fillRect(-1, 0, 3, 1).fillRect(0, -1, 1, 3);
    });
  }

  /** A ring on the ground in three-quarter view, `rx` wide and `ry` deep, centred on (x, y) — a body's feet. */
  groundRing(x: number, y: number, rx: number, ry: number, tone: T): void {
    const t = this.tones[tone];
    rx = Math.max(3, Math.round(rx));
    ry = Math.max(2, Math.round(ry));
    this.place(`ell:${rx}:${ry}:${tone}`, x, y, (g) => {
      pixels(g, ellipsePixels(rx + 1, ry + 1), t.dark);
      pixels(g, ellipsePixels(rx - 1, ry - 1), t.dark);
      pixels(g, ellipsePixels(rx, ry), t.rim);
      g.fillStyle(t.light, 1).fillRect(-rx, 0, 1, 1).fillRect(rx, 0, 1, 1).fillRect(-1, ry, 3, 1);
    });
  }

  /**
   * An aim line from (x, y) along `angle`, from `start` to `end` px out: chevrons `size` px across every `spacing`,
   * creeping forward with `now`, and a larger one at the end.
   */
  chevrons(now: number, x: number, y: number, angle: number, start: number, end: number, size: number, tone: T): void {
    const h = this.heading(angle);
    const a = (h / this.headings) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const shift = (now * this.creep) % this.spacing;
    const last = end - size;
    for (let d = start + shift; d < last - this.spacing * 0.5; d += this.spacing) this.chevron(x + cos * d, y + sin * d, h, a, size, tone);
    this.chevron(x + cos * last, y + sin * last, h, a, size + 2, tone);
  }

  /**
   * One still chevron `dist` px out from (x, y) along `angle`: the way the next blow goes. Unlike `chevrons` it does
   * not creep, so an arrow always under the feet does not keep catching the eye.
   */
  pointer(x: number, y: number, angle: number, dist: number, size: number, tone: T): void {
    const h = this.heading(angle);
    this.chevron(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, h, (h / this.headings) * Math.PI * 2, size, tone);
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i]!.g.setVisible(false);
    for (const g of this.shown) if (!this.next.has(g)) g.setVisible(false);
    for (const g of this.next) g.setVisible(true);
    const was = this.shown;
    this.shown = this.next;
    this.next = was;
  }

  destroy(): void {
    for (const g of this.cache.values()) g.destroy();
    for (const p of this.pool) p.g.destroy();
    this.cache.clear();
    this.pool.length = 0;
    this.shown.clear();
    this.next.clear();
  }

  private heading(angle: number): number {
    const n = this.headings;
    return ((Math.round((angle / (Math.PI * 2)) * n) % n) + n) % n;
  }

  private chevron(x: number, y: number, h: number, angle: number, size: number, tone: T): void {
    let slot = this.pool[this.used];
    if (!slot) {
      slot = { g: this.stage.add.graphics().setDepth(this.depth), key: '' };
      this.pool.push(slot);
    }
    this.used++;
    const key = `${h}:${size}:${tone}`;
    if (slot.key !== key) {
      slot.key = key;
      const t = this.tones[tone];
      const { lit, rim } = chevronPixels(angle, size);
      slot.g.clear();
      pixels(slot.g, rim, t.dark);
      pixels(slot.g, lit, t.light);
    }
    slot.g.setPosition(Math.round(x), Math.round(y)).setVisible(true);
  }

  private place(key: string, x: number, y: number, paint: (g: Graphics) => void): void {
    let g = this.cache.get(key);
    if (!g) {
      g = this.stage.add.graphics().setDepth(this.depth);
      paint(g);
      g.setVisible(false);
      this.cache.set(key, g);
    }
    g.setPosition(Math.round(x), Math.round(y));
    this.next.add(g);
  }
}
