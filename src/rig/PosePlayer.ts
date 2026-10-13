import { blendPose } from './poseMath';
import type { RigPose } from './rigTypes';

/**
 * A clip of key poses: by name (looked up in the player's library) or inline. The player blends between them, so a
 * few keys make a smooth motion; `blend: false` steps from key to key instead (pixel-art timing, a tumble).
 */
export interface PoseClip {
  poses: readonly (string | RigPose)[];
  /** Keys per second (default 8). */
  fps?: number;
  /** Per-key lengths in ms, overriding `fps`. */
  durations?: readonly number[];
  /** Start over at the end, blending the last key into the first (default true). */
  loop?: boolean;
  /** Blend between keys (default true). */
  blend?: boolean;
}

/**
 * Plays pose clips over time and answers the pose of this moment, blended between keys, with a crossfade when the
 * clip changes. Pure: give it a library of poses and clips, call `update(dt)`, read `pose`.
 *
 * ```ts
 * const player = new PosePlayer(HUMANOID_POSES, HUMANOID_CLIPS, 'idle');
 * player.play('walk', { fadeMs: 120 });
 * player.update(dt);
 * view.setPose(player.pose);
 * ```
 */
export class PosePlayer<Name extends string = string> {
  private clip: PoseClip;
  private name: Name;
  private elapsed = 0;
  private ended = false;
  /** The pose being faded out of, and how long the fade lasts and has run. */
  private from: RigPose | null = null;
  private fadeMs = 0;
  private fadeAt = 0;
  private cached: RigPose | null = null;
  speed = 1;
  /** Called when a clip that does not loop reaches its end. */
  onComplete: ((clip: Name) => void) | null = null;

  constructor(
    private readonly library: Readonly<Record<string, RigPose>>,
    private readonly clips: Record<Name, PoseClip>,
    initial: NoInfer<Name>,
  ) {
    this.clip = this.clipOf(initial);
    this.name = initial;
  }

  get current(): Name {
    return this.name;
  }

  get finished(): boolean {
    return this.ended;
  }

  /** Time into the current clip, ms. */
  get time(): number {
    return this.elapsed;
  }

  /** Plays `name`, fading from the pose shown now over `fadeMs`. The clip already playing keeps going unless `restart`. */
  play(name: Name, options: { fadeMs?: number; restart?: boolean } = {}): this {
    if (name === this.name && !options.restart) return this;
    const fadeMs = options.fadeMs ?? 0;
    this.from = fadeMs > 0 ? this.pose : null;
    this.fadeMs = fadeMs;
    this.fadeAt = 0;
    this.clip = this.clipOf(name);
    this.name = name;
    this.elapsed = 0;
    this.ended = false;
    this.cached = null;
    return this;
  }

  /** Advances by `dt` seconds. */
  update(dt: number): void {
    if (!(dt > 0) || this.speed <= 0) return;
    const ms = dt * 1000 * this.speed;
    this.cached = null;
    if (this.from) {
      this.fadeAt += ms;
      if (this.fadeAt >= this.fadeMs) this.from = null;
    }
    if (this.ended) return;
    this.elapsed += ms;
    const total = this.totalMs();
    if (this.elapsed >= total) {
      if (this.clip.loop !== false) {
        this.elapsed %= total;
      } else {
        this.elapsed = total;
        this.ended = true;
        this.onComplete?.(this.name);
      }
    }
  }

  /** The pose to show now. */
  get pose(): RigPose {
    if (this.cached) return this.cached;
    let pose = this.sample(this.elapsed);
    if (this.from) pose = blendPose(this.from, pose, Math.min(1, this.fadeAt / this.fadeMs));
    this.cached = pose;
    return pose;
  }

  /** The current clip's pose at `ms` into it. */
  sample(ms: number): RigPose {
    const keys = this.clip.poses;
    const n = keys.length;
    let t = Math.max(0, ms);
    for (let i = 0; i < n; i++) {
      const len = this.lengthOf(i);
      if (t < len || i === n - 1) {
        const a = this.resolve(keys[i]!);
        const last = i === n - 1;
        if (this.clip.blend === false || n === 1 || (last && this.clip.loop === false)) return a;
        const b = this.resolve(keys[last ? 0 : i + 1]!);
        return blendPose(a, b, Math.min(1, t / len));
      }
      t -= len;
    }
    return this.resolve(keys[n - 1]!);
  }

  private totalMs(): number {
    let sum = 0;
    for (let i = 0; i < this.clip.poses.length; i++) sum += this.lengthOf(i);
    return sum;
  }

  private lengthOf(i: number): number {
    return Math.max(1, this.clip.durations?.[i] ?? 1000 / (this.clip.fps ?? 8));
  }

  private resolve(key: string | RigPose): RigPose {
    if (typeof key !== 'string') return key;
    const pose = this.library[key];
    if (!pose) throw new Error(`PosePlayer: no pose "${key}" in the library`);
    return pose;
  }

  private clipOf(name: Name): PoseClip {
    const clip = this.clips[name];
    if (!clip) throw new Error(`PosePlayer: no clip "${name}"`);
    if (clip.poses.length === 0) throw new Error(`PosePlayer: clip "${name}" has no poses`);
    for (const k of clip.poses) this.resolve(k);
    return clip;
  }
}
