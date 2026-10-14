import { Container } from 'pixi.js';
import { DayClock, Graphics, mixRgb, type Camera, type DayState } from '../../src';
import { LEVEL_PX_H, LEVEL_PX_W } from './level';

/** Sky colours at the top and the horizon, by day and by night. */
const SKY_DAY = [0x6ec6ff, 0xc8ecff] as const;
const SKY_NIGHT = [0x141634, 0x3a3466] as const;
const BANDS = 8;
const DAY_MS = 120_000;
/** Every scene's backdrop reads one day that began with the page, so changing scene does not turn the clock back. */
const PAGE_START = Date.now();

/**
 * The sky behind the level and two rows of hills that scroll slower than the ground (parallax), all coloured by a
 * `DayClock`: a whole day passes in a couple of minutes, so the light can be watched changing. The clock also feeds
 * the scene's `ColorGrade`, which tints the level itself the same way.
 */
export class Backdrop {
  readonly view = new Container();
  readonly clock = new DayClock({
    periodMs: DAY_MS,
    // the page opens at mid-morning
    offsetMs: DAY_MS * 0.35 - (PAGE_START % DAY_MS),
    keys: [
      { at: 0, color: 0x30307a, alpha: 0.42 },
      { at: 0.22, color: 0x30307a, alpha: 0.42 },
      { at: 0.3, color: 0xff9a6a, alpha: 0.2 },
      { at: 0.4, color: 0xffffff, alpha: 0 },
      { at: 0.65, color: 0xffffff, alpha: 0 },
      { at: 0.75, color: 0xff7a50, alpha: 0.24 },
      { at: 0.85, color: 0x30307a, alpha: 0.42 },
      { at: 1, color: 0x30307a, alpha: 0.42 },
    ],
  });
  private readonly sky = new Graphics();
  private readonly far = new Graphics();
  private readonly near = new Graphics();
  private lastNight = -1;

  constructor() {
    this.view.zIndex = -1000;
    this.view.addChild(this.sky, this.far, this.near);
  }

  /** The day as it stands now. */
  now(): DayState {
    return this.clock.at(Date.now());
  }

  update(camera: Camera): void {
    const day = this.now();
    // repainted only when the light has moved a visible step, not every frame
    const night = Math.round(day.night * 32) / 32;
    if (night !== this.lastNight) {
      this.lastNight = night;
      this.paint(night);
    }
    // hills further away move less: a third and a half of the camera's travel
    this.far.x = Math.round(camera.scrollX * 0.66);
    this.near.x = Math.round(camera.scrollX * 0.5);
  }

  private paint(night: number): void {
    // the sky in hard bands rather than a smooth gradient, to sit with the pixel art; it overhangs the level so a
    // window wider than the level never shows its edge
    const top = mixRgb(SKY_DAY[0], SKY_NIGHT[0], night);
    const low = mixRgb(SKY_DAY[1], SKY_NIGHT[1], night);
    const h = LEVEL_PX_H + 64;
    const g = this.sky.clear();
    for (let i = 0; i < BANDS; i++) g.fillStyle(mixRgb(top, low, i / (BANDS - 1))).fillRect(-200, -32 + Math.floor((i * h) / BANDS), LEVEL_PX_W + 400, Math.ceil(h / BANDS) + 1);
    this.hills(this.far, mixRgb(0x9cc8d8, 0x2a2c58, night), 70, 22, 0.05);
    this.hills(this.near, mixRgb(0x6aa68a, 0x22284a, night), 92, 30, 0.08);
  }

  private hills(g: Graphics, color: number, base: number, height: number, freq: number): void {
    g.clear().fillStyle(color);
    // one column per 4 px, stepped like the ground's tiles
    for (let x = -200; x < LEVEL_PX_W + 200; x += 4) {
      const y = Math.round(base - height * (0.5 + 0.5 * Math.sin(x * freq) * Math.cos(x * freq * 0.37)));
      g.fillRect(x, y, 4, LEVEL_PX_H - y + 32);
    }
  }
}
