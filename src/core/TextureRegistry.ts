import { CanvasSource, Rectangle, Texture } from 'pixi.js';

/** A frame packed on an atlas page (TexturePacker and the like), as `assets/textureAtlas.ts` parses it. */
export interface PackedFrame {
  name: string;
  /** The rect on the page (already swapped to its on-page size when `rotated`). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Stored turned 90° clockwise on the page (Pixi's `rotate: 2`). */
  rotated: boolean;
  /** The untrimmed size of the sprite. */
  sourceW: number;
  sourceH: number;
  /** Where the trimmed pixels sit inside the untrimmed sprite; absent when the frame was not trimmed. */
  trim?: { x: number; y: number; w: number; h: number };
  /** The frame's pivot, 0–1, when the packer wrote one. */
  anchor?: { x: number; y: number };
}

/**
 * A canvas-backed texture with named frames; repaint the canvas, then `refresh()` to upload it. Made with a `view`, it
 * is one rect of another texture's canvas on that texture's own source (`TextureRegistry.addView`): small pieces
 * swapped every few frames then batch together, where a source each made Pixi rebuild its draw instructions at every
 * swap.
 */
export class CanvasTexture {
  readonly frames = new Map<string, Texture>();
  readonly source: CanvasSource;
  readonly whole: Texture;
  private readonly owned: boolean;

  constructor(
    readonly key: string,
    readonly canvas: HTMLCanvasElement,
    view?: { source: CanvasSource; frame: Rectangle },
  ) {
    this.owned = !view;
    this.source = view?.source ?? new CanvasSource({ resource: canvas, scaleMode: 'nearest' });
    this.whole = view ? new Texture({ source: this.source, frame: view.frame }) : new Texture({ source: this.source });
  }

  get width(): number {
    return this.owned ? this.canvas.width : this.whole.frame.width;
  }

  get height(): number {
    return this.owned ? this.canvas.height : this.whole.frame.height;
  }

  get context(): CanvasRenderingContext2D {
    return this.canvas.getContext('2d')!;
  }

  /** Adds a frame cut from the canvas (`_source` kept for the old call shape). */
  add(name: string, _source: number, x: number, y: number, w: number, h: number): void {
    this.frames.get(name)?.destroy();
    this.frames.set(name, new Texture({ source: this.source, frame: new Rectangle(x, y, w, h) }));
  }

  /**
   * Adds a packed frame cut from `page` (this texture's canvas by default): trimmed frames keep their untrimmed size
   * (`orig`) so they line up when drawn, and frames the packer turned are turned back (Pixi's `rotate: 2`).
   */
  addPacked(frame: PackedFrame, page: CanvasTexture = this): void {
    this.frames.get(frame.name)?.destroy();
    const texture = new Texture({
      source: page.source,
      frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
      orig: new Rectangle(0, 0, frame.sourceW, frame.sourceH),
      ...(frame.trim ? { trim: new Rectangle(frame.trim.x, frame.trim.y, frame.trim.w, frame.trim.h) } : {}),
      rotate: frame.rotated ? 2 : 0,
      ...(frame.anchor ? { defaultAnchor: frame.anchor } : {}),
    });
    this.frames.set(frame.name, texture);
  }

  /**
   * Registers under this texture a frame that lives on another one (an atlas page after the first), so the frame is
   * found by this texture's key. A texture of its own over the other page's source: each side frees its own.
   */
  adopt(name: string, from: CanvasTexture): void {
    const src = from.frames.get(name);
    if (!src) return;
    this.frames.get(name)?.destroy();
    this.frames.set(name, new Texture({ source: from.source, frame: src.frame.clone() }));
  }

  refresh(): void {
    this.source.update();
  }

  destroy(): void {
    for (const t of this.frames.values()) t.destroy();
    this.frames.clear();
    this.whole.destroy();
    // a view's source is its page's, freed with the page
    if (this.owned) this.source.destroy();
  }
}

/** Every texture of the world by key: the sprite atlas and per-player repainted sheets. */
export class TextureRegistry {
  private readonly textures = new Map<string, CanvasTexture>();
  /** Textures repainted or freed while in use (a rig body, its hand): a copy of one must snapshot it first. */
  private readonly live = new Set<string>();
  private missing = new Set<string>();
  private snapshots = 0;

  markLive(key: string): void {
    this.live.add(key);
  }

  isLive(key: string): boolean {
    return this.live.has(key);
  }

  /** A new texture holding frame `frame` of `key` as it is painted right now; returns its key (one frame, '0'). */
  snapshot(key: string, frame?: string | number): string {
    const src = this.get(key, frame);
    const { x, y, width, height } = src.frame;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const from = this.textures.get(key)?.canvas;
    if (from) canvas.getContext('2d')!.drawImage(from, x, y, width, height, 0, 0, width, height);
    const copy = `${key}#still${++this.snapshots}`;
    this.addCanvas(copy, canvas).add('0', 0, 0, 0, width, height);
    return copy;
  }

  /**
   * `snapshot` into a texture kept for reuse (`into`): its canvas is repainted in place and uploaded again, and only
   * made anew when the frame's size changes. Frame '0' is the copy.
   */
  snapshotInto(key: string, frame: string | number | undefined, into: string): void {
    const src = this.get(key, frame);
    const { x, y, width, height } = src.frame;
    let tex = this.textures.get(into);
    if (!tex || tex.width !== width || tex.height !== height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      tex = this.addCanvas(into, canvas);
      tex.add('0', 0, 0, 0, width, height);
    }
    const ctx = tex.context;
    ctx.clearRect(0, 0, width, height);
    const from = this.textures.get(key)?.canvas;
    if (from) ctx.drawImage(from, x, y, width, height, 0, 0, width, height);
    tex.refresh();
  }

  exists(key: string): boolean {
    return this.textures.has(key);
  }

  addCanvas(key: string, canvas: HTMLCanvasElement): CanvasTexture {
    this.remove(key);
    const tex = new CanvasTexture(key, canvas);
    this.textures.set(key, tex);
    return tex;
  }

  /** A canvas cut into equal frames named 0, 1, 2... left to right, then row by row. */
  addSpriteSheet(key: string, canvas: HTMLCanvasElement, size: { frameWidth: number; frameHeight: number }): CanvasTexture {
    const tex = this.addCanvas(key, canvas);
    const cols = Math.floor(canvas.width / size.frameWidth);
    const rows = Math.floor(canvas.height / size.frameHeight);
    for (let i = 0; i < cols * rows; i++) {
      tex.add(String(i), 0, (i % cols) * size.frameWidth, Math.floor(i / cols) * size.frameHeight, size.frameWidth, size.frameHeight);
    }
    return tex;
  }

  /**
   * A packed atlas (TexturePacker JSON, `AssetLoader.atlas`): the first page under `key`, the others as `key~1`,
   * `key~2`… like `AtlasBuilder`'s pages, and every frame of every page found under `key` by its name.
   */
  addAtlas(key: string, pages: readonly { canvas: HTMLCanvasElement; frames: readonly PackedFrame[] }[]): CanvasTexture {
    if (pages.length === 0) throw new Error(`TextureRegistry: atlas "${key}" has no pages`);
    for (let i = 1; ; i++) {
      if (!this.textures.has(`${key}~${i}`)) break;
      this.remove(`${key}~${i}`);
    }
    const first = this.addCanvas(key, pages[0]!.canvas);
    pages.forEach((p, i) => {
      const page = i === 0 ? first : this.addCanvas(`${key}~${i}`, p.canvas);
      for (const f of p.frames) {
        if (page !== first) page.addPacked(f);
        first.addPacked(f, page);
      }
    });
    return first;
  }

  /**
   * Registers `key` as the rect (x, y, w, h) of the texture `page`, on the page's source: shown by `setTexture(key)`
   * like any texture, and batched with every other view of that page. Null when the page is not registered.
   */
  addView(key: string, page: string, x: number, y: number, w: number, h: number): CanvasTexture | null {
    const from = this.textures.get(page);
    if (!from) return null;
    this.remove(key);
    const tex = new CanvasTexture(key, from.canvas, { source: from.source, frame: new Rectangle(x, y, w, h) });
    this.textures.set(key, tex);
    return tex;
  }

  createCanvas(key: string, width: number, height: number): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return this.addCanvas(key, canvas);
  }

  remove(key: string): void {
    this.textures.get(key)?.destroy();
    this.textures.delete(key);
    this.live.delete(key);
  }

  get(key: string, frame?: string | number): Texture {
    const tex = this.textures.get(key);
    if (!tex) return this.warn(key);
    if (frame === undefined || frame === '') return tex.whole;
    return tex.frames.get(String(frame)) ?? this.warn(`${key}/${frame}`);
  }

  private warn(what: string): Texture {
    if (!this.missing.has(what)) {
      this.missing.add(what);
      console.warn(`[textures] missing ${what}`);
    }
    return Texture.EMPTY;
  }
}
