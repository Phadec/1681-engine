/*
 * Where every image goes in the world atlas, kept pure (no canvas) so the packing decision is unit-tested. The
 * builder (`atlas.ts`) paints what this plans.
 */

export const ATLAS_PAD = 2;
const MIN_ATLAS_WIDTH = 1024;
/** The page side every desktop GPU takes, and the one the atlas was built to before pages existed. */
export const ATLAS_PAGE_FULL = 8192;
/** The page side on a GPU that reports less than `ATLAS_PAGE_FULL` (older iPhones and iPads: 4096). */
const ATLAS_PAGE_SMALL = 4096;

/**
 * How big an atlas page may be on this device: 8192 wherever the GPU takes it (every desktop — unchanged), else
 * split at 4096, or at the largest power of two the GPU does take if that is smaller still. Unknown: 8192, as before.
 */
export function atlasPageLimit(maxTextureSize: number | null): number {
  if (maxTextureSize === null || maxTextureSize >= ATLAS_PAGE_FULL) return ATLAS_PAGE_FULL;
  return Math.min(ATLAS_PAGE_SMALL, 2 ** Math.floor(Math.log2(Math.max(1, maxTextureSize))));
}

export interface AtlasSize {
  w: number;
  h: number;
}

interface AtlasPage {
  width: number;
  height: number;
}

interface AtlasPlan {
  pages: AtlasPage[];
  /** One per input, in input order: the page and the top-left corner. */
  places: { page: number; x: number; y: number }[];
}

/**
 * Shelf-packs the images, tallest first, into pages no larger than `limit` on either side. The page width is the
 * power of two that fits the widest image and the square root of the total area (at least 1024), capped at `limit`;
 * a shelf that would run past `limit` starts a new page. With everything fitting under `limit` this is exactly the
 * single page the atlas always was. An image larger than `limit` itself is given a page of its own (the GPU will
 * refuse it, but nothing else is lost with it).
 */
export function planAtlas(sizes: readonly AtlasSize[], limit: number): AtlasPlan {
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b]!.h - sizes[a]!.h);
  const area = sizes.reduce((sum, s) => sum + (s.w + ATLAS_PAD) * (s.h + ATLAS_PAD), 0);
  const widest = Math.max(1, ...sizes.map((s) => s.w + ATLAS_PAD));
  const width = Math.min(limit, Math.max(MIN_ATLAS_WIDTH, 2 ** Math.ceil(Math.log2(Math.max(widest, Math.sqrt(area))))));
  const places: AtlasPlan['places'] = new Array(sizes.length);
  const pages: AtlasPage[] = [];
  let page = 0;
  let x = 0;
  let y = 0;
  let shelf = 0;
  let pageWidth = width;
  const close = () => pages.push({ width: pageWidth, height: y + shelf });
  for (const i of order) {
    const w = sizes[i]!.w + ATLAS_PAD;
    const h = sizes[i]!.h + ATLAS_PAD;
    if (x > 0 && x + w > pageWidth) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    if (y > 0 && y + h > limit) {
      close();
      page++;
      x = 0;
      y = 0;
      shelf = 0;
      pageWidth = width;
    }
    // an image wider than the page (only past `limit`) widens its own page rather than overlapping the edge
    if (w > pageWidth) pageWidth = w;
    places[i] = { page, x, y };
    x += w;
    shelf = Math.max(shelf, h);
  }
  if (sizes.length > 0) close();
  return { pages, places };
}
