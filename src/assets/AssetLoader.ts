import { parseTiled, type TileMap, type Tileset } from '../tilemap/tiled';

/** Where loaded images go: the stage's `TextureRegistry` satisfies it. */
export interface TextureSink {
  addCanvas(key: string, canvas: HTMLCanvasElement): unknown;
  addSpriteSheet(key: string, canvas: HTMLCanvasElement, size: { frameWidth: number; frameHeight: number }): unknown;
}

export interface AssetLoaderOptions {
  /** Prefix for relative URLs (default: none, so relative to the page). */
  baseUrl?: string;
  /** Requests running at once (default 6). */
  concurrency?: number;
  /** For tests and custom transports: defaults to the global `fetch`. */
  fetch?: (url: string) => Promise<{ ok: boolean; status: number; blob(): Promise<Blob>; json(): Promise<unknown>; text(): Promise<string> }>;
  /** Turns image bytes into a canvas; defaults to `createImageBitmap` drawn onto a new canvas. */
  toCanvas?: (blob: Blob) => Promise<HTMLCanvasElement>;
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

/**
 * Loads a scene's assets before it starts: queue them, then `await load()`. Images become textures in the stage's
 * registry (frames of a sprite sheet named 0, 1, 2…); JSON, text and Tiled maps are kept here by key. A failed asset
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
      this.textures.addCanvas(key, await this.toCanvas(await this.blob(url)));
    });
  }

  /** An image cut into equal frames named 0, 1, 2…, left to right, then row by row. */
  spritesheet(key: string, url: string, size: { frameWidth: number; frameHeight: number }): this {
    return this.add(key, async () => {
      this.textures.addSpriteSheet(key, await this.toCanvas(await this.blob(url)), size);
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

  private async request(url: string) {
    const full = resolveUrl(url, this.options.baseUrl ?? '');
    let res;
    try {
      res = await this.fetcher(full);
    } catch (err) {
      throw new Error(`AssetLoader: could not fetch ${full}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) throw new Error(`AssetLoader: ${full} answered ${res.status}`);
    return res;
  }

  private async blob(url: string): Promise<Blob> {
    return (await this.request(url)).blob();
  }
}
