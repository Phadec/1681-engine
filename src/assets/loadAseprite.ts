import { Rectangle, Texture } from 'pixi.js';
import { parseAseprite } from '../anim/parseAseprite';
import type { AsepriteSheet } from '../anim/asepriteTypes';
import type { CanvasTexture } from '../core/TextureRegistry';
import { resolveUrl, type AssetLoaderOptions } from './AssetLoader';

/** Where an Aseprite sheet's texture goes: the stage's `TextureRegistry` satisfies it. */
export interface AsepriteTextureSink {
  addCanvas(key: string, canvas: HTMLCanvasElement): CanvasTexture;
}

/** Fetch and decode hooks, as `AssetLoader` takes them (tests, custom transports, a base URL). */
export type AsepriteLoadOptions = Pick<AssetLoaderOptions, 'baseUrl' | 'fetch' | 'toCanvas'>;

/**
 * Registers `canvas` (the sheet image) under `key` with one frame per sheet frame, named by its index ("0", "1"…), so
 * the clips `parseAseprite` returns play on an `Image` of that key as they are. A trimmed frame keeps its untrimmed
 * size and offset (Pixi's `orig` and `trim`), so a sprite anchored at its feet does not jump as the trim changes.
 */
export function addAsepriteTextures(textures: AsepriteTextureSink, key: string, canvas: HTMLCanvasElement, sheet: AsepriteSheet): CanvasTexture {
  const tex = textures.addCanvas(key, canvas);
  for (const f of sheet.frames) {
    const { x, y, w, h } = f.rect;
    if (!f.trimmed) {
      tex.add(String(f.index), 0, x, y, w, h);
      continue;
    }
    tex.frames.get(String(f.index))?.destroy();
    tex.frames.set(
      String(f.index),
      new Texture({
        source: tex.source,
        frame: new Rectangle(x, y, w, h),
        orig: new Rectangle(0, 0, f.sourceW, f.sourceH),
        trim: new Rectangle(f.offsetX, f.offsetY, w, h),
      }),
    );
  }
  return tex;
}

/**
 * Loads an Aseprite export — the JSON, then the sheet image it names (resolved beside the JSON) — registers its
 * frames under `key` and returns the parsed sheet (clips, slices, layers, cues).
 *
 * ```ts
 * const [hero] = await Promise.all([loadAseprite(stage.textures, 'hero', 'art/hero.json'), assets.load()]);
 * const sprite = stage.add.image(0, 0, 'hero', 0);
 * const anim = new Animator(hero.clips, 'idle');
 * ```
 */
export async function loadAseprite(textures: AsepriteTextureSink, key: string, jsonUrl: string, options: AsepriteLoadOptions = {}): Promise<AsepriteSheet> {
  const fetcher = options.fetch ?? ((url: string) => fetch(url));
  const get = async (url: string) => {
    let res;
    try {
      res = await fetcher(url);
    } catch (err) {
      throw new Error(`loadAseprite: could not fetch ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) throw new Error(`loadAseprite: ${url} answered ${res.status}`);
    return res;
  };
  const jsonFull = resolveUrl(jsonUrl, options.baseUrl ?? '');
  const sheet = parseAseprite(await (await get(jsonFull)).json());
  if (!sheet.image) throw new Error(`loadAseprite: ${jsonFull} names no sheet image (meta.image)`);
  const blob = await (await get(resolveUrl(sheet.image, jsonFull))).blob();
  const canvas = await (options.toCanvas ?? blobToCanvas)(blob);
  addAsepriteTextures(textures, key, canvas, sheet);
  return sheet;
}

async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('loadAseprite: no 2D context (out of canvas memory?)');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}
