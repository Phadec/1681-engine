import type { PixelLayer } from '../core/PixelLayer';
import type { Stage } from '../core/Stage';
import { engineSettings } from '../settings';
import type { WorldObject } from '../core/types';
import { ramp } from './pixelTone';
import type { PackedPixels } from './spritePixels';

/** What a dying body hands over: its feet in the world, how it was drawn, and the pixels of its last frame. */
export interface DeathPixels {
  x: number;
  y: number;
  /** World pixels per sprite pixel (the body's `scale`), negative when the body faced left. */
  scaleX: number;
  scaleY: number;
  pixels: PackedPixels;
}

const FRAME_MS = 1000 / 12;
/** Pixels in flight across every cloud at once: a crowd dying together shares this, it never adds to it. */
const BUDGET = 1400;
const PER_BODY = 150;
const PER_BIG = 420;
/** Even a body dying into a full budget leaves a few of its pixels, or it would just blink out. */
const MIN_PER_BODY = 16;
/** The same three under reduced effects or the battery saver. */
const THIN = { budget: 500, body: 60, big: 160 };

interface Cloud {
  g: PixelLayer;
  x: number;
  y: number;
  born: number;
  end: number;
  size: number;
  n: number;
  /** Per particle: start offset, release delay, lifetime, drift speed, wobble phase. */
  x0: Float32Array;
  y0: Float32Array;
  delay: Float32Array;
  life: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  phase: Float32Array;
  color: Uint32Array;
  frame: number;
}

/**
 * A dead body evaporating: it breaks into its own pixels, which let go top rows first, rise, scatter a little and
 * give out, while the body itself is hidden by the caller. Every particle is one whole world pixel in a colour read
 * off the body's last frame, painted at 12 fps like every other effect; it pales up its own ramp as it rises and
 * steps its alpha down instead of melting, so it stays pixel art the whole way. A cloud is one `PixelLayer` (a pooled
 * texture) rather than a Graphics of up to 1,400 rects.
 */
export class Evaporation {
  private readonly clouds: Cloud[] = [];
  private live = 0;

  constructor(
    private readonly scene: Stage,
    private readonly track: (object: WorldObject) => void,
  ) {}

  play(d: DeathPixels, big: boolean, now: number): void {
    const s = engineSettings.getState();
    const thin = s.reducedFx || s.batterySaver;
    const want = Math.min(d.pixels.length, big ? (thin ? THIN.big : PER_BIG) : thin ? THIN.body : PER_BODY);
    const n = Math.min(want, Math.max(MIN_PER_BODY, (thin ? THIN.budget : BUDGET) - this.live));
    if (n <= 0) return;
    const size = Math.max(1, Math.round(Math.abs(d.scaleY)));
    const g = this.scene.add.pixels();
    this.track(g);
    const c: Cloud = {
      g, x: Math.round(d.x), y: Math.round(d.y), born: now, end: now, size, n, frame: -1,
      x0: new Float32Array(n), y0: new Float32Array(n), delay: new Float32Array(n), life: new Float32Array(n),
      vx: new Float32Array(n), vy: new Float32Array(n), phase: new Float32Array(n), color: new Uint32Array(n),
    };
    let top = 0;
    let bottom = -Infinity;
    let halfW = 1;
    const px = d.pixels;
    for (let k = 0; k < px.length; k++) {
      top = Math.min(top, px.dy[k]!);
      bottom = Math.max(bottom, px.dy[k]!);
      halfW = Math.max(halfW, Math.abs(px.dx[k]! * d.scaleX));
    }
    const height = Math.max(1, bottom - top);
    const spread = big ? 520 : 260;
    const lifeMs = big ? 900 : 620;
    // a random subset when the body has more pixels than its share; every pixel otherwise
    const keep = n / px.length;
    let i = 0;
    for (let k = 0; k < px.length && i < n; k++) {
      if (keep < 1 && Math.random() > keep && px.length - k > n - i) continue;
      const pdy = px.dy[k]!;
      const x = px.dx[k]! * d.scaleX;
      const y = pdy * Math.abs(d.scaleY);
      const fromTop = (pdy - top) / height;
      c.x0[i] = x;
      c.y0[i] = y;
      // the top lets go first and the feet last, so the body dissolves upwards
      c.delay[i] = fromTop * spread * 0.6 + Math.random() * spread * 0.4;
      c.life[i] = lifeMs * (0.6 + Math.random() * 0.6);
      c.vx[i] = (x / halfW) * 5 + (Math.random() - 0.5) * 10;
      c.vy[i] = -(10 + Math.random() * 16) * (big ? 1.3 : 1);
      c.phase[i] = Math.random() * Math.PI * 2;
      c.color[i] = px.color[k]!;
      c.end = Math.max(c.end, now + c.delay[i]! + c.life[i]!);
      i++;
    }
    c.n = i;
    this.live += c.n;
    this.clouds.push(c);
    this.draw(c, now);
  }

  update(now: number): void {
    for (let k = this.clouds.length - 1; k >= 0; k--) {
      const c = this.clouds[k]!;
      if (!c.g.active || now >= c.end) {
        if (c.g.active) c.g.destroy();
        this.live -= c.n;
        this.clouds.splice(k, 1);
        continue;
      }
      this.draw(c, now);
    }
  }

  private draw(c: Cloud, now: number): void {
    const frame = Math.floor((now - c.born) / FRAME_MS);
    if (frame === c.frame) return;
    c.frame = frame;
    const ms = frame * FRAME_MS;
    const g = c.g;
    g.clear();
    g.setPosition(c.x, c.y).setDepth(c.y + 2);
    const s = c.size;
    for (let i = 0; i < c.n; i++) {
      const t = ms - c.delay[i]!;
      let x = c.x0[i]!;
      let y = c.y0[i]!;
      let color = c.color[i]!;
      let alpha = 1;
      if (t > 0) {
        const k = t / c.life[i]!;
        if (k >= 1) continue;
        const sec = t / 1000;
        // rises faster as it goes, and sways as it rises
        x += c.vx[i]! * sec + Math.sin(c.phase[i]! + sec * 9) * k * 1.5;
        y += c.vy[i]! * sec - 22 * sec * sec;
        const r = ramp(color);
        color = k < 0.3 ? color : k < 0.6 ? r.light : r.hi;
        alpha = k < 0.55 ? 1 : k < 0.8 ? 0.66 : 0.33;
      }
      g.rect(Math.round(x), Math.round(y), s, s, color, alpha);
    }
    g.present();
  }
}
