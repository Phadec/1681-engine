import type { BLEND_MODES } from 'pixi.js';
import type { Image } from '../core/Image';
import { fillSolid, solidSilhouette } from '../core/silhouette';
import type { Stage } from '../core/Stage';

export interface AfterimagesOptions {
  /** Colours the copies wear, cycled one per copy (default white): a trail shimmering from white to blue, say. */
  tints?: readonly number[];
  /** Opacity a copy starts at (default 0.6). */
  alpha?: number;
  /** How long a copy takes to fade out, ms (default 260). */
  durationMs?: number;
  /** The least time between two copies, ms (default 22: a copy every frame or so at 60 fps without doubling up). */
  spacingMs?: number;
  /** The scale a copy shrinks to as it fades, a share of the body's (default 0.85; 1 keeps it). */
  endScale?: number;
  /** How copies blend (default `'add'`: light; `'normal'` for painted shadows). */
  blend?: BLEND_MODES;
  /**
   * Copies of a live body (one repainted every frame) are kept in a ring of this many textures, reused, and spent
   * copies are pooled up to this many (default 16: at 22 ms apart and 260 ms each, never all in use at once).
   */
  slots?: number;
}

let afterimageSeq = 0;

/**
 * Afterimages of a moving body — a dash, a blink, a quick step: copies of its current frame left behind as flat
 * silhouettes in a tint, fading out. A copy is its frame's cached solid silhouette (`solidSilhouette`) tinted, not a
 * fill filter, so a trail costs no render pass per copy; copies are pooled rather than made every few ms, and a live
 * body's frames are snapshotted into a fixed ring of textures instead of a new canvas each time.
 */
export class Afterimages {
  private readonly tints: readonly number[];
  private readonly alpha: number;
  private readonly durationMs: number;
  private readonly spacingMs: number;
  private readonly endScale: number;
  private readonly blend: BLEND_MODES;
  private readonly slots: number;
  private readonly prefix = `afterimage${++afterimageSeq}_`;
  /** The copy wearing each ring slot's texture: it goes before its texture is painted over. */
  private readonly slotUsers: (Image | null)[] = [];
  private slot = 0;
  private readonly fading = new Set<Image>();
  private readonly free: Image[] = [];
  private lastAt = Number.NEGATIVE_INFINITY;
  private count = 0;

  constructor(
    private readonly stage: Stage,
    options: AfterimagesOptions = {},
  ) {
    this.tints = options.tints?.length ? options.tints : [0xffffff];
    this.alpha = options.alpha ?? 0.6;
    this.durationMs = options.durationMs ?? 260;
    this.spacingMs = options.spacingMs ?? 22;
    this.endScale = options.endScale ?? 0.85;
    this.blend = options.blend ?? 'add';
    this.slots = Math.max(1, options.slots ?? 16);
  }

  /**
   * Leaves a copy of `body` as drawn now, standing at world (x, y) with draw order `depth` (default just behind a
   * body sorted by `y`), unless one was left less than `spacingMs` before `now`. Answers the copy, or null when none
   * was laid (too soon, or the frame could not be read): a caller drawing its own speed streaks between copies
   * follows that.
   */
  trail(body: Image, x: number, y: number, now: number, depth = y - 1): Image | null {
    if (now - this.lastAt < this.spacingMs) return null;
    const copy = this.copyOf(body, x, y);
    if (!copy) return null;
    this.lastAt = now;
    copy
      .setOrigin(body.originX, body.originY)
      .setFlipX(body.flipX)
      .setScale(body.scaleX, body.scaleY)
      .setRotation(body.rotation)
      .setAlpha(this.alpha)
      .setDepth(depth)
      .setBlendMode(this.blend);
    // a white silhouette tinted is the tint wherever the body was opaque: the fill without a filter
    copy.tint = this.tints[this.count++ % this.tints.length]!;
    this.fading.add(copy);
    this.stage.tweens.add({
      targets: copy,
      alpha: 0,
      scaleX: body.scaleX * this.endScale,
      scaleY: body.scaleY * this.endScale,
      duration: this.durationMs,
      onComplete: () => this.spend(copy),
    });
    return copy;
  }

  /** Copies still fading. */
  get active(): number {
    return this.fading.size;
  }

  private copyOf(body: Image, x: number, y: number): Image | null {
    const textures = this.stage.textures;
    if (!textures.isLive(body.textureKey)) {
      const solid = solidSilhouette(body.texture);
      if (!solid) return null;
      const pooled = this.free.pop();
      const out = pooled && !pooled.destroyed ? pooled.setTexture(body.textureKey, body.frameName) : this.stage.add.image(x, y, body.textureKey, body.frameName);
      out.texture = solid;
      return out.setPosition(x, y).setVisible(true);
    }
    const i = this.slot;
    this.slot = (i + 1) % this.slots;
    // still fading (hit-stop slows the tweens): it goes before its texture is painted over
    const prev = this.slotUsers[i];
    if (prev && !prev.destroyed) {
      this.stage.tweens.killTweensOf(prev);
      this.fading.delete(prev);
      prev.setVisible(false);
    }
    const key = this.prefix + i;
    textures.snapshotInto(body.textureKey, body.frameName, key);
    const tex = textures.get(key, '0');
    fillSolid(tex.source.resource);
    tex.source.update();
    const img = prev && !prev.destroyed ? prev.setTexture(key, '0').setPosition(x, y).setVisible(true) : this.stage.add.image(x, y, key, '0');
    this.slotUsers[i] = img;
    return img;
  }

  /** A faded copy: hidden and kept for the next one (a ring slot's copy stays with its slot). */
  private spend(copy: Image): void {
    this.fading.delete(copy);
    if (copy.destroyed) return;
    copy.setVisible(false);
    if (this.slotUsers.includes(copy)) return;
    if (this.free.length < this.slots) this.free.push(copy);
    else copy.destroy();
  }

  /** Takes every copy off the stage and frees the ring's textures. */
  destroy(): void {
    for (const c of this.fading) {
      this.stage.tweens.killTweensOf(c);
      if (!this.slotUsers.includes(c)) c.destroy();
    }
    this.fading.clear();
    for (const c of this.free) c.destroy();
    this.free.length = 0;
    for (const c of this.slotUsers) if (c && !c.destroyed) c.destroy();
    for (let i = 0; i < this.slotUsers.length; i++) this.stage.textures.remove(this.prefix + i);
    this.slotUsers.length = 0;
  }
}
