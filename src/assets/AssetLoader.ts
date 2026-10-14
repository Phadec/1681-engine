import { sound } from '../audio/SoundEngine';
import type { CanvasTexture } from '../core/TextureRegistry';
import { parseTiled, type TileMap, type Tileset } from '../tilemap/tiled';
import { collectAtlasPages, duplicateFrames, parseAtlas, type AtlasFrame } from './textureAtlas';

/** Where loaded images go: the stage's `TextureRegistry` satisfies it. */
export interface TextureSink {
  addCanvas(key: string, canvas: HTMLCanvasElement): unknown;
  addSpriteSheet(key: string, canvas: HTMLCanvasElement, size: { frameWidth: number; frameHeight: number }): unknown;
  /** Needed only by `atlas`; the stage's `TextureRegistry` has it. */
  addAtlas?(key: string, pages: readonly { canvas: HTMLCanvasElement; frames: readonly AtlasFrame[] }[]): CanvasTexture | unknown;
}

/** What a fetch must answer with; `arrayBuffer` is optional so older custom transports keep working (blob is used). */
export interface AssetResponse {
  ok: boolean;
  status: number;
  blob(): Promise<Blob>;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}

/** What an atlas brought besides its textures: its frame names (every page) and animations. */
export interface AtlasInfo {
  frames: string[];
  animations: Record<string, string[]>;
  pages: number;
}

export interface AssetLoaderOptions {
  /** Prefix for relative URLs (default: none, so relative to the page). */
  baseUrl?: string;
  /** Requests running at once (default 6). */
  concurrency?: number;
  /** For tests and custom transports: defaults to the global `fetch`. */
  fetch?: (url: string) => Promise<AssetResponse>;
  /** Turns image bytes into a canvas; defaults to `createImageBitmap` drawn onto a new canvas. */
  toCanvas?: (blob: Blob) => Promise<HTMLCanvasElement>;
  /**
   * The context `audio` decodes through (default: the engine's sound context, `sound.audioContext`, once a gesture
   * opened it). Null means "not yet": the bytes are kept and decoded on first `decodeAudio`.
   */
  audioContext?: () => BaseAudioContext | null;
  /** Installs a font's bytes; defaults to a `FontFace` added to `document.fonts`. */
  addFont?: (family: string, data: ArrayBuffer, descriptors?: FontFaceDescriptors) => Promise<void>;
}

export interface TilemapAssetOptions {
  /** The texture key a tileset's image is loaded under (default: the tileset's name). */
  textureKey?: (tileset: Tileset) => string;
}

export interface LoadProgress {
  done: number;
  total: number;
  /** The asset that just finished. */
  key: string;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Job = { key: string; run: () => Promise<void> };

/** `url` resolved against `base` the way a browser would (a bare file name sits beside its map). */
export function resolveUrl(url: string, base: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/')) return url;
  const dir = base.slice(0, base.lastIndexOf('/') + 1);
  const parts = (dir + url).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..' && out.length && out[out.length - 1] !== '..' && out[out.length - 1] !== '') out.pop();
    else if (p !== '.') out.push(p);
  }
  return out.join('/');
}

async function defaultToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('AssetLoader: no 2D context (out of canvas memory?)');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

async function defaultAddFont(family: string, data: ArrayBuffer, descriptors?: FontFaceDescriptors): Promise<void> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    throw new Error(`AssetLoader: this browser cannot load the font "${family}" (no FontFace)`);
  }
  const face = new FontFace(family, data, descriptors);
  await face.load();
  document.fonts.add(face);
}

/**
 * Loads a scene's assets before it starts: queue them, then `await load()`. Images become textures in the stage's
 * registry (frames of a sprite sheet named 0, 1, 2…); JSON, text and Tiled maps are kept here by key; atlases register every frame under their key; fonts go to
 * `document.fonts`; audio is decoded into `AudioBuffer`s (or kept as bytes until a context exists). A failed asset
 * fails the whole load with its URL in the message.
 *
 * ```ts
 * override async onEnter() {
 *   const assets = new AssetLoader(this.engine.stage.textures);
 *   assets.spritesheet('hero', 'art/hero.png', { frameWidth: 20, frameHeight: 24 }).tilemap('level', 'maps/level.tmj');
 *   await assets.load(({ done, total }) => bar.set(done / total));
 *   const map = assets.map('level');
 * }
 * ```
 */
export class AssetLoader {
  private readonly queue: Job[] = [];
  private readonly data = new Map<string, unknown>();
  private readonly maps = new Map<string, TileMap>();
  private readonly atlases = new Map<string, AtlasInfo>();
  /** Decoded audio by key; a key with bytes only waits for a context (`decodeAudio`). */
  private readonly audioBuffers = new Map<string, AudioBuffer>();
  private readonly audioBytes = new Map<string, ArrayBuffer>();
  private readonly decoding = new Map<string, Promise<AudioBuffer>>();
  private readonly fetcher: NonNullable<AssetLoaderOptions['fetch']>;
  private readonly toCanvas: (blob: Blob) => Promise<HTMLCanvasElement>;
  private total = 0;
  private done = 0;

  constructor(
    private readonly textures: TextureSink,
    private readonly options: AssetLoaderOptions = {},
  ) {
    this.fetcher = options.fetch ?? ((url) => fetch(url));
    this.toCanvas = options.toCanvas ?? defaultToCanvas;
  }

  image(key: string, url: string): this {
    return this.add(key, async () => {
      this.textures.addCanvas(key, await this.canvas(url));
    });
  }

  /** An image cut into equal frames named 0, 1, 2…, left to right, then row by row. */
  spritesheet(key: string, url: string, size: { frameWidth: number; frameHeight: number }): this {
    return this.add(key, async () => {
      this.textures.addSpriteSheet(key, await this.canvas(url), size);
    });
  }

  json(key: string, url: string): this {
    return this.add(key, async () => {
      this.data.set(key, await (await this.request(url)).json());
    });
  }

  text(key: string, url: string): this {
    return this.add(key, async () => {
      this.data.set(key, await (await this.request(url)).text());
    });
  }

  /** A Tiled JSON map, then every tileset image it names (resolved beside the map file). */
  tilemap(key: string, url: string, options: TilemapAssetOptions = {}): this {
    return this.add(key, async () => {
      const map = parseTiled(await (await this.request(url)).json());
      this.maps.set(key, map);
      const textureKey = options.textureKey ?? ((ts: Tileset) => ts.name);
      for (const ts of map.tilesets) this.image(textureKey(ts), resolveUrl(ts.image, url));
    });
  }

  /**
   * A TexturePacker (or Pixi) JSON atlas, hash or array format: its page image, and for a multipack atlas every page
   * named in `meta.related_multi_packs` (each resolved beside the file naming it). The first page is the texture
   * `key`, further pages `key~1`, `key~2`…, and every frame of every page is found as `textures.get(key, frameName)`.
   * Counts as one asset in the progress.
   */
  atlas(key: string, url: string): this {
    return this.add(key, async () => {
      const add = this.textures.addAtlas?.bind(this.textures);
      if (!add) throw new Error(`AssetLoader: the texture sink cannot take atlases (no addAtlas) for "${key}"`);
      const pages = await collectAtlasPages(
        url,
        async (u) => parseAtlas(await (await this.request(u)).json(), u),
        resolveUrl,
      );
      const canvases = await Promise.all(pages.map((p) => this.canvas(resolveUrl(p.page.image, p.url))));
      const dupes = duplicateFrames(pages.map((p) => p.page));
      if (dupes.length) console.warn(`[assets] atlas "${key}" names ${dupes.length} frame(s) on more than one page: ${dupes.slice(0, 5).join(', ')}`);
      add(key, pages.map((p, i) => ({ canvas: canvases[i]!, frames: p.page.frames })));
      const animations: Record<string, string[]> = {};
      for (const p of pages) Object.assign(animations, p.page.animations);
      this.atlases.set(key, { frames: [...new Set(pages.flatMap((p) => p.page.frames.map((f) => f.name)))], animations, pages: pages.length });
    });
  }

  /**
   * A web font (woff2, woff, ttf) under `family`, added to `document.fonts` once loaded so canvas text and the DOM can
   * use it at once — load fonts before the first `Text` is drawn, or it measures with the fallback.
   */
  font(family: string, url: string, descriptors?: FontFaceDescriptors): this {
    const install = this.options.addFont ?? defaultAddFont;
    return this.add(family, async () => {
      const data = await this.bytes(url);
      try {
        await install(family, data, descriptors);
      } catch (err) {
        // the browser's own message ("Invalid font data in ArrayBuffer.") names neither the font nor the file
        throw new Error(`AssetLoader: could not load font "${family}" from ${this.full(url)}: ${messageOf(err)}`);
      }
    });
  }

  /**
   * A sound file decoded into an `AudioBuffer` through the engine's audio context (`getAudio`). Before any context
   * exists (browsers open one only after a gesture) the bytes are kept and decoded by `decodeAudio`, so a loading
   * screen never has to wait for the player to click.
   */
  audio(key: string, url: string): this {
    return this.add(key, async () => {
      const data = await this.bytes(url);
      this.audioBuffers.delete(key);
      this.decoding.delete(key);
      const ctx = (this.options.audioContext ?? (() => sound.audioContext))();
      if (ctx) this.audioBuffers.set(key, await this.decode(ctx, data, url));
      else this.audioBytes.set(key, data);
    });
  }

  /** A loaded sound, decoded; null while it waits for an audio context (`decodeAudio`). */
  getAudio(key: string): AudioBuffer | null {
    const buffer = this.audioBuffers.get(key);
    if (buffer) return buffer;
    if (this.audioBytes.has(key)) return null;
    throw new Error(`AssetLoader: no audio loaded as "${key}"`);
  }

  /** A loaded sound, decoding its kept bytes through `ctx` (default: the loader's context) the first time. */
  decodeAudio(key: string, ctx?: BaseAudioContext): Promise<AudioBuffer> {
    const ready = this.audioBuffers.get(key);
    if (ready) return Promise.resolve(ready);
    const pending = this.decoding.get(key);
    if (pending) return pending;
    const data = this.audioBytes.get(key);
    if (!data) return Promise.reject(new Error(`AssetLoader: no audio loaded as "${key}"`));
    const context = ctx ?? (this.options.audioContext ?? (() => sound.audioContext))();
    if (!context) return Promise.reject(new Error(`AssetLoader: no audio context to decode "${key}" yet`));
    const job = this.decode(context, data, key).then(
      (buffer) => {
        this.audioBuffers.set(key, buffer);
        this.audioBytes.delete(key);
        this.decoding.delete(key);
        return buffer;
      },
      (err: unknown) => {
        this.decoding.delete(key);
        throw err;
      },
    );
    this.decoding.set(key, job);
    return job;
  }

  /** What a loaded atlas holds: its frame names and animations. */
  getAtlas(key: string): AtlasInfo {
    const a = this.atlases.get(key);
    if (!a) throw new Error(`AssetLoader: no atlas loaded as "${key}"`);
    return a;
  }

  /** Runs everything queued; `onProgress` after each asset. Safe to call again after queueing more. */
  async load(onProgress?: (p: LoadProgress) => void): Promise<void> {
    const limit = Math.max(1, this.options.concurrency ?? 6);
    const worker = async (): Promise<void> => {
      for (let job = this.queue.shift(); job; job = this.queue.shift()) {
        await job.run();
        this.done++;
        onProgress?.({ done: this.done, total: this.total, key: job.key });
      }
    };
    // a finished tilemap queues its tilesets: keep draining until nothing is left
    while (this.queue.length) await Promise.all(Array.from({ length: limit }, worker));
  }

  /** A loaded JSON value. */
  getJson<T = unknown>(key: string): T {
    if (!this.data.has(key)) throw new Error(`AssetLoader: no JSON or text loaded as "${key}"`);
    return this.data.get(key) as T;
  }

  /** A loaded text file. */
  getText(key: string): string {
    return this.getJson<string>(key);
  }

  /** A loaded Tiled map. */
  map(key: string): TileMap {
    const m = this.maps.get(key);
    if (!m) throw new Error(`AssetLoader: no tilemap loaded as "${key}"`);
    return m;
  }

  private add(key: string, run: () => Promise<void>): this {
    this.queue.push({ key, run });
    this.total++;
    return this;
  }

  private full(url: string): string {
    return resolveUrl(url, this.options.baseUrl ?? '');
  }

  private async request(url: string) {
    const full = this.full(url);
    let res;
    try {
      res = await this.fetcher(full);
    } catch (err) {
      throw new Error(`AssetLoader: could not fetch ${full}: ${messageOf(err)}`);
    }
    if (!res.ok) throw new Error(`AssetLoader: ${full} answered ${res.status}`);
    return res;
  }

  private async blob(url: string): Promise<Blob> {
    return (await this.request(url)).blob();
  }

  /** An image file decoded into a canvas; a file that is not an image fails naming its URL. */
  private async canvas(url: string): Promise<HTMLCanvasElement> {
    const blob = await this.blob(url);
    try {
      return await this.toCanvas(blob);
    } catch (err) {
      // `createImageBitmap` says only "The source image could not be decoded.", which in a load of fifty images
      // left no way to tell which one was broken
      throw new Error(`AssetLoader: could not decode image ${this.full(url)}: ${messageOf(err)}`);
    }
  }

  private async bytes(url: string): Promise<ArrayBuffer> {
    const res = await this.request(url);
    return typeof res.arrayBuffer === 'function' ? res.arrayBuffer() : (await res.blob()).arrayBuffer();
  }

  private async decode(ctx: BaseAudioContext, data: ArrayBuffer, where: string): Promise<AudioBuffer> {
    try {
      // decodeAudioData detaches what it is given: hand it a copy so the bytes survive a failed decode
      return await ctx.decodeAudioData(data.slice(0));
    } catch (err) {
      throw new Error(`AssetLoader: could not decode audio ${where}: ${messageOf(err)}`);
    }
  }
}
