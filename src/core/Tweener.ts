import { easeByName } from './eases';

type Target = Record<string, unknown> & { destroyed?: boolean };

/** Tween config in the shape the renderer has always used: numeric props at the top level or under `props`. */
interface TweenConfig {
  targets: object | object[];
  duration?: number;
  delay?: number;
  /** Ms to stay at the end values before a yoyo plays back. */
  hold?: number;
  yoyo?: boolean;
  /** Extra plays after the first (-1 = forever). */
  repeat?: number;
  ease?: string;
  props?: Record<string, number>;
  onStart?: () => void;
  onUpdate?: () => void;
  onComplete?: () => void;
  [prop: string]: unknown;
}

const RESERVED = new Set([
  'targets', 'duration', 'delay', 'hold', 'yoyo', 'repeat', 'ease', 'props', 'onStart', 'onUpdate', 'onComplete',
]);

interface Track {
  target: Target;
  prop: string;
  from: number;
  to: number;
}

/** One running tween; `remove()` stops it without calling onComplete. */
class Tween {
  private tracks: Track[] | null = null;
  private elapsed = 0;
  private plays = 0;
  removed = false;
  readonly targets: Target[];

  constructor(
    private readonly cfg: TweenConfig,
    private readonly ends: Record<string, number>,
  ) {
    const t = cfg.targets;
    this.targets = (Array.isArray(t) ? t : [t]) as Target[];
  }

  /**
   * Every target is a destroyed display object: nothing is left to move. A forever tween (`repeat: -1`) on a sprite
   * its owner freed used to stay in the list for good, holding the sprite, and the list grew with every map loaded.
   * A plain object (a clock a callback reads) has no `destroyed` and is never taken for one. Only a forever tween is
   * dropped this way: a finite one still runs out and calls its `onComplete`, which may clean up more than the sprite.
   */
  private orphaned(): boolean {
    if (this.cfg.repeat !== -1) return false;
    const ts = this.targets;
    if (ts.length === 0) return false;
    for (const t of ts) if (t.destroyed !== true) return false;
    return true;
  }

  remove(): void {
    this.removed = true;
  }

  stop(): void {
    this.removed = true;
  }

  /** Advances by `dt` ms; returns false once the tween is finished. */
  step(dt: number): boolean {
    if (this.removed) return false;
    if (this.orphaned()) {
      this.removed = true;
      return false;
    }
    const cfg = this.cfg;
    const delay = cfg.delay ?? 0;
    this.elapsed += dt;
    if (this.elapsed < delay) return true;
    if (!this.tracks) {
      this.tracks = [];
      for (const target of this.targets) {
        for (const [prop, to] of Object.entries(this.ends)) this.tracks.push({ target, prop, from: read(target, prop), to });
      }
      cfg.onStart?.();
    }
    const duration = Math.max(1, cfg.duration ?? 1000);
    const hold = cfg.yoyo ? cfg.hold ?? 0 : 0;
    const cycle = cfg.yoyo ? duration * 2 + hold : duration;
    let local = this.elapsed - delay - this.plays * cycle;
    const repeat = cfg.repeat ?? 0;
    let finished = false;
    if (local >= cycle) {
      if (repeat === -1 || this.plays < repeat) {
        this.plays++;
        local -= cycle;
      } else {
        local = cycle;
        finished = true;
      }
    }
    let p: number;
    if (!cfg.yoyo) p = local / duration;
    else if (local <= duration) p = local / duration;
    else if (local <= duration + hold) p = 1;
    else p = 1 - (local - duration - hold) / duration;
    const k = easeByName(cfg.ease)(Math.min(1, Math.max(0, p)));
    for (const t of this.tracks) if (!t.target.destroyed) write(t.target, t.prop, t.from + (t.to - t.from) * k);
    cfg.onUpdate?.();
    if (finished) {
      this.removed = true;
      cfg.onComplete?.();
      return false;
    }
    return true;
  }
}

function read(target: Target, prop: string): number {
  const v = prop === 'scale' ? target['scaleX'] : target[prop];
  return typeof v === 'number' ? v : 0;
}

function write(target: Target, prop: string, value: number): void {
  if (prop === 'scale') {
    target['scaleX'] = value;
    target['scaleY'] = value;
  } else target[prop] = value;
}

/** Frame-driven tween manager (the renderer's replacement for Phaser's TweenManager). */
export class Tweener {
  /** Global speed factor; hit-stop slows every tween at once. */
  timeScale = 1;
  private tweens: Tween[] = [];

  add(cfg: TweenConfig): Tween {
    const ends: Record<string, number> = { ...(cfg.props ?? {}) };
    const starts: Record<string, number> = {};
    for (const [k, v] of Object.entries(cfg)) {
      if (RESERVED.has(k)) continue;
      if (typeof v === 'number') ends[k] = v;
      else if (v && typeof v === 'object' && 'to' in v) {
        const range = v as { from?: number; to: number };
        ends[k] = range.to;
        if (range.from !== undefined) starts[k] = range.from;
      }
    }
    // `{ from, to }` jumps to `from` right away, before any delay
    const targets = (Array.isArray(cfg.targets) ? cfg.targets : [cfg.targets]) as Record<string, unknown>[];
    for (const t of targets) for (const [k, v] of Object.entries(starts)) t[k] = v;
    const tween = new Tween(cfg, ends);
    this.tweens.push(tween);
    return tween;
  }

  killTweensOf(target: object | object[]): void {
    const set = new Set(Array.isArray(target) ? target : [target]);
    for (const t of this.tweens) if (t.targets.some((x) => set.has(x))) t.remove();
  }

  update(dt: number): void {
    const scaled = dt * this.timeScale;
    // tweens started from a callback run from the next frame on, like Phaser's
    // compacted in place: the ones added meanwhile sit past `n` and keep their order after the survivors
    const list = this.tweens;
    const n = list.length;
    let kept = 0;
    for (let i = 0; i < n; i++) {
      const t = list[i]!;
      if (stepSafely(t, scaled)) list[kept++] = t;
    }
    // a callback that cleared the manager dropped this list, and every tween on it was removed
    if (this.tweens !== list) return;
    for (let i = n; i < list.length; i++) list[kept++] = list[i]!;
    list.length = kept;
  }

  clear(): void {
    for (const t of this.tweens) t.remove();
    this.tweens = [];
  }
}

/** A tween whose step or callback throws is dropped, so it neither throws every frame nor leaves the list half compacted. */
function stepSafely(t: { step(dt: number): boolean }, dt: number): boolean {
  try {
    return t.step(dt);
  } catch (err) {
    console.error('[tween] dropped after an error', err);
    return false;
  }
}
