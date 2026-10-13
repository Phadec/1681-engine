import { Container, Sprite } from 'pixi.js';
import type { Stage } from '../core/Stage';
import { FLIP_D, FLIP_H, FLIP_V, tileAt, tileRect, type TileLayer, type TileMap, type Tileset } from './tiled';

export interface TilemapViewOptions {
  /** The texture key holding a tileset's image (loaded with `AssetLoader.image`, or painted). Default: `tileset.name`. */
  textureFor?: (tileset: Tileset) => string;
  /** Tiles per chunk side (default 32): each chunk is painted once into a texture of its own. */
  chunkTiles?: number;
  /** Only these tile layers, by name; default every visible tile layer. */
  layers?: string[];
  /**
   * Depth of the first layer in the world layer; each layer after it one higher. Bodies are usually drawn at their y,
   * so the default keeps the map under every one of them. A layer with a numeric `depth` property is drawn there
   * instead (a roof layer over the bodies: `depth` = 1e6).
   */
  baseDepth?: number;
  /** Where the layers go (default the stage's world layer); a scene passes its `root` so they leave with it. */
  parent?: Container;
}

let nextView = 0;

/**
 * Draws a Tiled map's tile layers. Each layer is cut into chunks painted once into textures; a frame only toggles
 * which chunks are in view (`update`), so a map of any size costs a handful of sprites a frame.
 *
 * Animated tiles are drawn on their first frame.
 */
export class TilemapView {
  /** One container per drawn tile layer, by name, each at its own depth among the bodies. */
  readonly layers = new Map<string, Container>();
  private readonly chunks: { sprite: Sprite; x: number; y: number; w: number; h: number; key: string }[] = [];
  private readonly id = nextView++;

  constructor(
    private readonly stage: Stage,
    readonly map: TileMap,
    options: TilemapViewOptions = {},
  ) {
    const textureFor = options.textureFor ?? ((ts: Tileset) => ts.name);
    const chunk = Math.max(1, options.chunkTiles ?? 32);
    const base = options.baseDepth ?? -1_000_000;
    const wanted = options.layers ? new Set(options.layers) : null;
    const layers = map.layers.filter((l): l is TileLayer => l.kind === 'tiles' && (wanted ? wanted.has(l.name) : l.visible));
    const parent = options.parent ?? stage.world;
    layers.forEach((layer, n) => {
      const depth = typeof layer.properties.depth === 'number' ? layer.properties.depth : base + n;
      const holder = new Container();
      holder.zIndex = depth;
      holder.alpha = layer.opacity;
      holder.position.set(layer.offsetX, layer.offsetY);
      this.layers.set(layer.name, holder);
      parent.addChild(holder);
      for (let cy = 0; cy < map.height; cy += chunk) {
        for (let cx = 0; cx < map.width; cx += chunk) {
          const cw = Math.min(chunk, map.width - cx);
          const ch = Math.min(chunk, map.height - cy);
          this.paintChunk(layer, holder, cx, cy, cw, ch, textureFor);
        }
      }
    });
  }

  /** Shows only the chunks in the camera's view (plus a margin in world px). Call once a frame. */
  update(margin = 32): void {
    const v = this.stage.cameras.main.worldView;
    for (const c of this.chunks) {
      c.sprite.visible = c.x < v.right + margin && c.x + c.w > v.x - margin && c.y < v.bottom + margin && c.y + c.h > v.y - margin;
    }
  }

  /** World size of the map in px. */
  get widthPx(): number {
    return this.map.width * this.map.tileWidth;
  }

  get heightPx(): number {
    return this.map.height * this.map.tileHeight;
  }

  destroy(): void {
    for (const c of this.chunks) this.stage.textures.remove(c.key);
    this.chunks.length = 0;
    for (const c of this.layers.values()) c.destroy({ children: true });
    this.layers.clear();
  }

  private paintChunk(layer: TileLayer, holder: Container, cx: number, cy: number, cw: number, ch: number, textureFor: (ts: Tileset) => string): void {
    const { map } = this;
    const tw = map.tileWidth;
    const th = map.tileHeight;
    let any = false;
    const key = `tilemap:${this.id}:${layer.name}:${cx},${cy}`;
    // tiles taller than the grid (trees on a 16 px grid) overhang the cell above, so the chunk has room for them
    const tallest = Math.max(th, ...map.tilesets.map((t) => t.tileHeight));
    const pad = tallest - th;
    const tex = this.stage.textures.createCanvas(key, cw * tw, ch * th + pad);
    const ctx = tex.context;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const raw = layer.data[(cy + y) * map.width + (cx + x)]!;
        const t = tileAt(map, raw);
        if (!t) continue;
        const src = this.stage.textures.exists(textureFor(t.tileset)) ? this.stage.textures.get(textureFor(t.tileset)).source.resource : null;
        if (!src) continue;
        const r = tileRect(t.tileset, t.local);
        // a tile is drawn on its cell's bottom-left corner, as Tiled does
        const dx = x * tw;
        const dy = pad + (y + 1) * th - r.h;
        ctx.save();
        ctx.translate(dx + r.w / 2, dy + r.h / 2);
        if (raw & FLIP_D) ctx.transform(0, 1, 1, 0, 0, 0);
        ctx.scale(raw & FLIP_H ? -1 : 1, raw & FLIP_V ? -1 : 1);
        ctx.drawImage(src as CanvasImageSource, r.x, r.y, r.w, r.h, -r.w / 2, -r.h / 2, r.w, r.h);
        ctx.restore();
        any = true;
      }
    }
    if (!any) {
      this.stage.textures.remove(key);
      return;
    }
    tex.refresh();
    const sprite = new Sprite(tex.whole);
    sprite.position.set(cx * tw, cy * th - pad);
    holder.addChild(sprite);
    this.chunks.push({ sprite, x: sprite.x + layer.offsetX, y: sprite.y + layer.offsetY, w: cw * tw, h: ch * th + pad, key });
  }
}
