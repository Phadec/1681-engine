import type { TextureRegistry } from './TextureRegistry';
import { ATLAS_PAGE_FULL, planAtlas } from './atlasPlan';

interface AtlasItem {
  name: string;
  canvas: HTMLCanvasElement;
  frameWidth?: number;
  frameHeight?: number;
}

/**
 * Packs many small procedurally painted canvases into as few textures as the GPU allows, so Pixi can batch every
 * sprite of the world into very few draw calls. One page on every desktop (up to 8192 square); a device whose GPU
 * takes less gets pages of `limit` (`atlasPageLimit`, `planAtlas`). Every frame is registered under the one `key`
 * whichever page holds it — the pages after the first are textures of their own (`key~1`, `key~2`…) whose frames
 * the first page's texture adopts — so the world keeps asking for `atlas` and a frame name, and never knows.
 * Frame names: `name` for single images, `name#i` for sheet frames.
 */
export class AtlasBuilder {
  private items: AtlasItem[] = [];

  add(name: string, canvas: HTMLCanvasElement): void {
    this.items.push({ name, canvas });
  }

  addSheet(name: string, canvas: HTMLCanvasElement, frameWidth: number, frameHeight: number): void {
    this.items.push({ name, canvas, frameWidth, frameHeight });
  }

  build(textures: TextureRegistry, key: string, limit = ATLAS_PAGE_FULL): void {
    const items = this.items;
    const plan = planAtlas(items.map((it) => ({ w: it.canvas.width, h: it.canvas.height })), limit);
    const pages = plan.pages.map((p, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = p.width;
      canvas.height = p.height;
      // kept on the CPU (`willReadFrequently`): the atlas is drawn once, then read many times — the sway rigs' trunks,
      // a death's evaporating pixels, a hit's white silhouette — and on a GPU canvas the first read pulled the whole
      // page back, 300 ms on entering a new map (profiled)
      return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true })!, key: i === 0 ? key : `${key}~${i}` };
    });
    items.forEach((it, i) => {
      const at = plan.places[i]!;
      pages[at.page]!.ctx.drawImage(it.canvas, at.x, at.y);
    });
    const first = textures.addCanvas(key, pages[0]!.canvas);
    const texOf = pages.map((p, i) => (i === 0 ? first : textures.addCanvas(p.key, p.canvas)));
    items.forEach((it, i) => {
      const at = plan.places[i]!;
      const page = texOf[at.page]!;
      // a frame on a later page is also registered on the first, so `atlas` + its name finds it
      const add = (name: string, x: number, y: number, w: number, h: number) => {
        page.add(name, 0, x, y, w, h);
        if (at.page > 0) first.adopt(name, page);
      };
      if (it.frameWidth && it.frameHeight) {
        // a sheet may wrap into rows (`makeSheet`'s `maxWidth`, a very large creature's); frames are read row by row
        const cols = Math.floor(it.canvas.width / it.frameWidth);
        const rows = Math.max(1, Math.floor(it.canvas.height / it.frameHeight));
        for (let f = 0; f < cols * rows; f++)
          add(`${it.name}#${f}`, at.x + (f % cols) * it.frameWidth, at.y + Math.floor(f / cols) * it.frameHeight, it.frameWidth, it.frameHeight);
      } else {
        add(it.name, at.x, at.y, it.canvas.width, it.canvas.height);
      }
    });
    const sizes = plan.pages.map((p) => `${p.width}x${p.height}`).join(' + ');
    console.info(`[atlas] ${key}: ${items.length} images packed into ${sizes}${plan.pages.length > 1 ? ` (pages of ${limit})` : ''}`);
  }
}
