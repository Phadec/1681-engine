/**
 * Frame animation of one sprite: which clip plays, which frame it is on. Pure state, advanced by time; a system copies
 * `frame` onto the sprite (`animationSystem`).
 *
 * ```ts
 * const clips = { idle: { frames: [0, 1], fps: 2 }, walk: { frames: [2, 3, 4, 5], fps: 10 }, die: { frames: [6, 7, 8], fps: 8, loop: false } };
 * const a = new Animator(clips, 'idle');
 * a.play('walk');          // switching to the clip already playing keeps its place
 * a.update(dt);            // seconds
 * sprite.setFrame(a.frame);
 * ```
 */
export interface AnimationClip {
  /** Frame names or indices of the sprite sheet, in order. */
  frames: readonly (string | number)[];
  /** Frames per second (default 10). Pixel art usually wants 8–12. */
  fps?: number;
  /** Start over at the end (default true); otherwise hold the last frame and report it finished. */
  loop?: boolean;
  /** Per-frame lengths in ms, overriding `fps` (a held key pose, a quick smear). */
  durations?: readonly number[];
}

export type AnimationClips = Record<string, AnimationClip>;

export class Animator<Name extends string = string> {
  private clip: AnimationClip;
  private index = 0;
  private elapsed = 0;
  private ended = false;
  private name: Name;
  /** Called when a clip that does not loop reaches its last frame. */
  onComplete: ((clip: Name) => void) | null = null;
  /** Playback speed multiplier (1 normal, 0 paused). */
  speed = 1;

  constructor(
    private readonly clips: Record<Name, AnimationClip>,
    initial: NoInfer<Name>,
  ) {
    const clip = clips[initial];
    if (!clip) throw new Error(`Animator: no clip "${initial}"`);
    if (clip.frames.length === 0) throw new Error(`Animator: clip "${initial}" has no frames`);
    this.clip = clip;
    this.name = initial;
  }

  /** The clip playing. */
  get current(): Name {
    return this.name;
  }

  /** The frame to show now. */
  get frame(): string | number {
    return this.clip.frames[this.index]!;
  }

  /** Which frame of the clip (0-based). */
  get frameIndex(): number {
    return this.index;
  }

  /** A non-looping clip has reached its last frame. */
  get finished(): boolean {
    return this.ended;
  }

  /** Plays `name`. The clip already playing keeps its place unless `restart`. */
  play(name: Name, restart = false): this {
    if (name === this.name && !restart) return this;
    const clip = this.clips[name];
    if (!clip) throw new Error(`Animator: no clip "${name}"`);
    if (clip.frames.length === 0) throw new Error(`Animator: clip "${name}" has no frames`);
    this.clip = clip;
    this.name = name;
    this.index = 0;
    this.elapsed = 0;
    this.ended = false;
    return this;
  }

  /** Advances by `dt` seconds; returns true when the frame changed. */
  update(dt: number): boolean {
    if (this.ended || !(dt > 0) || this.speed <= 0) return false;
    this.elapsed += dt * 1000 * this.speed;
    const before = this.index;
    const n = this.clip.frames.length;
    for (let len = this.lengthOf(this.index); this.elapsed >= len; len = this.lengthOf(this.index)) {
      this.elapsed -= len;
      if (this.index < n - 1) {
        this.index++;
      } else if (this.clip.loop !== false) {
        this.index = 0;
      } else {
        this.ended = true;
        this.elapsed = 0;
        this.onComplete?.(this.name);
        break;
      }
    }
    return this.index !== before;
  }

  private lengthOf(i: number): number {
    const ms = this.clip.durations?.[i] ?? 1000 / (this.clip.fps ?? 10);
    return Math.max(1, ms);
  }
}
