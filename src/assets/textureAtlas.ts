import type { PackedFrame } from '../core/TextureRegistry';

/**
 * Reads TexturePacker's JSON atlases — the "JSON (Hash)" and "JSON (Array)" exports, which Pixi's own `Spritesheet`
 * also reads — into plain numbers, with no Pixi or DOM, so the parsing is tested under node. A multipack atlas lists
 * its other pages' JSON files in `meta.related_multi_packs`; the loader follows them and registers every frame of
 * every page under one key.
 */

/** One frame as the registry needs it: where it lies on its page and how it is trimmed or turned. */
export type AtlasFrame = PackedFrame;

/** One page of an atlas: its image and its frames. */
export interface PackedAtlasPage {
  /** The page image as named in `meta.image`, relative to the JSON file. */
  image: string;
  frames: AtlasFrame[];
  /** Animations by name, each a list of frame names (`animations` in Pixi-flavoured JSON). */
  animations: Record<string, string[]>;
  /** Further pages' JSON files (`meta.related_multi_packs`), relative to this one. */
  related: string[];
  /** Pixels per unit the page was exported at (`meta.scale`, default 1). */
  scale: number;
}

interface RawRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RawFrame {
  filename?: string;
  frame?: RawRect;
  rotated?: boolean;
  trimmed?: boolean;
  spriteSourceSize?: RawRect;
  sourceSize?: { w: number; h: number };
  anchor?: { x: number; y: number };
  pivot?: { x: number; y: number };
}

function isRect(v: unknown): v is RawRect {
  const r = v as RawRect | null;
  return typeof r === 'object' && r !== null && [r.x, r.y, r.w, r.h].every((n) => typeof n === 'number' && Number.isFinite(n));
}

function readFrame(name: string, raw: RawFrame, where: string): AtlasFrame {
  if (!isRect(raw.frame)) throw new Error(`${where}: frame "${name}" has no frame rect`);
  const f = raw.frame;
  const rotated = raw.rotated === true;
  // TexturePacker writes the sprite's own (unturned) size; on the page a turned frame is h wide and w tall
  const out: AtlasFrame = {
    name,
    x: Math.floor(f.x),
    y: Math.floor(f.y),
    w: Math.floor(rotated ? f.h : f.w),
    h: Math.floor(rotated ? f.w : f.h),
    rotated,
    sourceW: Math.floor(raw.trimmed && raw.sourceSize ? raw.sourceSize.w : f.w),
    sourceH: Math.floor(raw.trimmed && raw.sourceSize ? raw.sourceSize.h : f.h),
  };
  if (raw.trimmed !== false && isRect(raw.spriteSourceSize) && raw.sourceSize) {
    const s = raw.spriteSourceSize;
    const untrimmed = s.x === 0 && s.y === 0 && f.w === raw.sourceSize.w && f.h === raw.sourceSize.h;
    if (!untrimmed) {
      out.trim = { x: Math.floor(s.x), y: Math.floor(s.y), w: Math.floor(f.w), h: Math.floor(f.h) };
      out.sourceW = Math.floor(raw.sourceSize.w);
      out.sourceH = Math.floor(raw.sourceSize.h);
    }
  }
  const pivot = raw.anchor ?? raw.pivot;
  if (pivot && typeof pivot.x === 'number' && typeof pivot.y === 'number') out.anchor = { x: pivot.x, y: pivot.y };
  return out;
}

/** Parses one atlas JSON file; throws naming `where` (its URL) when it is not one. */
export function parseAtlas(json: unknown, where = 'atlas'): PackedAtlasPage {
  const data = json as { frames?: unknown; meta?: { image?: unknown; related_multi_packs?: unknown; scale?: unknown }; animations?: unknown } | null;
  if (typeof data !== 'object' || data === null || typeof data.frames !== 'object' || data.frames === null) {
    throw new Error(`${where}: not a TexturePacker JSON atlas (no "frames")`);
  }
  const image = data.meta?.image;
  if (typeof image !== 'string' || image === '') throw new Error(`${where}: no "meta.image"`);
  const frames: AtlasFrame[] = Array.isArray(data.frames)
    ? data.frames.map((raw: RawFrame, i) => readFrame(typeof raw?.filename === 'string' ? raw.filename : String(i), raw ?? {}, where))
    : Object.entries(data.frames as Record<string, RawFrame>).map(([name, raw]) => readFrame(name, raw ?? {}, where));
  const related = Array.isArray(data.meta?.related_multi_packs)
    ? (data.meta.related_multi_packs as unknown[]).filter((r): r is string => typeof r === 'string' && r !== '')
    : [];
  const animations: Record<string, string[]> = {};
  if (typeof data.animations === 'object' && data.animations !== null) {
    for (const [name, list] of Object.entries(data.animations as Record<string, unknown>)) {
      if (Array.isArray(list)) animations[name] = list.filter((f): f is string => typeof f === 'string');
    }
  }
  const scale = Number(data.meta?.scale);
  return { image, frames, animations, related, scale: Number.isFinite(scale) && scale > 0 ? scale : 1 };
}

/**
 * Every page of a multipack atlas, the first first, each JSON fetched once however the pages name each other
 * (TexturePacker lists every other page in each page). `load(url)` returns a page's parsed JSON; `resolve` turns a
 * related name into a URL beside the file naming it.
 */
export async function collectAtlasPages(
  url: string,
  load: (url: string) => Promise<PackedAtlasPage>,
  resolve: (name: string, base: string) => string,
): Promise<{ url: string; page: PackedAtlasPage }[]> {
  const seen = new Set<string>([url]);
  const out: { url: string; page: PackedAtlasPage }[] = [];
  const queue = [url];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const page = await load(next);
    out.push({ url: next, page });
    for (const name of page.related) {
      const r = resolve(name, next);
      if (!seen.has(r)) {
        seen.add(r);
        queue.push(r);
      }
    }
  }
  return out;
}

/** Frame names that appear on more than one page: the later page's frame wins, which is almost always a mistake. */
export function duplicateFrames(pages: readonly PackedAtlasPage[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const p of pages) for (const f of p.frames) (seen.has(f.name) ? dupes : seen).add(f.name);
  return [...dupes];
}
