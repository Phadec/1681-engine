import type { Stage } from '../core/Stage';
import { tintNight, type DayClock } from '../ambient/DayClock';
import { Darkness } from './Darkness';

export interface NightShadeOptions {
  /** The day the night follows. */
  clock: DayClock;
  /** This place's own night colour, pulled in as the night deepens (`tintNight`); none keeps the clock's. */
  tint?: number;
  /** How far the tint takes over at full night (default 0.6). */
  tintShare?: number;
  /** A lamp's hole in the night against the glow it is drawn with (default 1.6: the light reaches past the glow). */
  lampScale?: number;
  /** The radius (world px) of the light a body carries at full night; 0 for none (default 64). */
  carriedLight?: number;
  /** The night share below which nothing is carried (default 0.55): at dusk a hole round the feet reads as a spotlight. */
  carriedFrom?: number;
}

/**
 * The outdoor night: a `DayClock`'s grade laid over the world as a dithered `Darkness`, deepening at dusk and lifting
 * at dawn, with every lamp, window and fire burning a hole in it — the same erase trick an underground is lit by,
 * only with a sheet whose colour and depth follow the clock. A place under no sky (a cave) builds a `Darkness` of its
 * own instead; at noon the sheet has no alpha and costs nothing.
 */
export class NightShade {
  private readonly dark: Darkness;
  private readonly lampScale: number;
  private readonly carried: number;
  private readonly carriedFrom: number;

  constructor(
    stage: Stage,
    private readonly options: NightShadeOptions,
  ) {
    this.dark = new Darkness(stage, 0x000000, 0);
    this.dark.setShade(0, 0);
    this.lampScale = options.lampScale ?? 1.6;
    this.carried = options.carriedLight ?? 64;
    this.carriedFrom = Math.min(0.99, options.carriedFrom ?? 0.55);
  }

  /** A light the place glows with, `glowSize` the diameter of the glow drawn for it: by night it is what is seen by. */
  addLight(x: number, y: number, glowSize: number, color?: number, flicker = 0): void {
    this.dark.addLamp(x, y, (glowSize / 2) * this.lampScale, flicker, color);
  }

  /** Lamps colour the dark less (a "fewer ambient lights" setting); their holes stay as wide. */
  setLampsDimmed(dim: boolean): void {
    this.dark.setLampsDimmed(dim);
  }

  /** `now` the frame's ms, `wallMs` the shared wall time the clock reads (`serverNow()`), `px`/`py` the player. */
  update(now: number, wallMs: number, px: number, py: number): void {
    const day = this.options.clock.at(wallMs);
    this.dark.setShade(tintNight(day, this.options.tint, this.options.tintShare), day.alpha);
    const from = this.carriedFrom;
    this.dark.update(now, px, py, Math.max(0, (day.night - from) / (1 - from)) * this.carried);
  }

  destroy(): void {
    this.dark.destroy();
  }
}
