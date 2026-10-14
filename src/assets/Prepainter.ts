/** A painted RGBA image: `w` × `h` pixels, 4 bytes each, row by row (what `ImageData` holds). */
export interface PaintedPixels {
  w: number;
  h: number;
  pixels: ArrayBuffer;
}

/** Paints an item's texture off the main thread (`workerPainter`), or anywhere else that answers with a promise. */
export interface Painter<T> {
  paint(item: T, id: string): Promise<PaintedPixels>;
  /** Stops it for good (a worker terminated). */
  dispose?(): void;
}

/** What a `Prepainter` needs of a texture registry (`TextureRegistry` has it). */
export interface PrepainterTextures {
  exists(key: string): boolean;
  remove(key: string): void;
  addCanvas(key: string, canvas: HTMLCanvasElement): unknown;
}

export interface PrepainterOptions<T> {
  textures: PrepainterTextures;
  /** The item's id, unique among items. */
  id: (item: T) => string;
  /** The texture key an id's painting is kept under (default the id itself). */
  key?: (id: string) => string;
  /** Null where nothing can be painted ahead: then everything is painted on arrival, as without a prepainter. */
  painter: Painter<T> | null;
  /** Turns painted pixels into a canvas (default a DOM canvas; tests hand in a stand-in). */
  canvas?: (painted: PaintedPixels) => HTMLCanvasElement | null;
  /** Told when a painting landed in the registry. */
  onPainted?: (id: string) => void;
}

function domCanvas({ w, h, pixels }: PaintedPixels): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), w, h), 0, 0);
  return canvas;
}

/**
 * Paints ahead the big textures a player may need next (the maps beyond the current one's doors, the next level's
 * backdrop) so the step into them finds them ready instead of painting them there and then — a large map's ground was
 * two seconds of main-thread work, which froze the first step through every door. It also frees the rest: each such
 * texture is one big image, and a long session through thirty-odd places kept every one of them.
 *
 * Whatever is not ready yet is the caller's to paint on arrival, as before; a painter that cannot start or fails only
 * means nothing is painted ahead.
 */
export class Prepainter<T> {
  private readonly pending = new Set<string>();
  /** Ids whose painting is held as a texture: the current one and its neighbours. */
  private readonly held = new Set<string>();
  private readonly key: (id: string) => string;
  private destroyed = false;

  constructor(private readonly options: PrepainterOptions<T>) {
    this.key = options.key ?? ((id) => id);
  }

  /**
   * Stands on `current`: its texture (painted by the caller on arrival, or ahead) and its neighbours' are kept, every
   * other one this prepainter held is freed, and the neighbours not yet painted are started.
   */
  enter(current: T, next: readonly T[]): void {
    const id = this.options.id;
    const here = id(current);
    const keep = new Set([here, ...next.map(id)]);
    for (const held of this.held) {
      if (keep.has(held)) continue;
      this.options.textures.remove(this.key(held));
      this.held.delete(held);
    }
    this.held.add(here);
    for (const item of next) this.prepare(item);
  }

  /** Whether `id` is being painted right now (so a caller may wait for it a moment rather than paint it again). */
  painting(id: string): boolean {
    return this.pending.has(id);
  }

  /** Ids held as textures now. */
  get holding(): ReadonlySet<string> {
    return this.held;
  }

  /** Starts painting `item` unless it is painted or under way. */
  prepare(item: T): void {
    const id = this.options.id(item);
    const ready = this.options.textures.exists(this.key(id));
    if (ready) this.held.add(id);
    const painter = this.options.painter;
    if (ready || this.pending.has(id) || !painter || this.destroyed) return;
    this.pending.add(id);
    painter.paint(item, id).then(
      (painted) => this.receive(id, painted),
      () => this.pending.delete(id),
    );
  }

  /** Stops painting; textures already made are left to the registry. */
  destroy(): void {
    this.destroyed = true;
    this.options.painter?.dispose?.();
    this.pending.clear();
  }

  private receive(id: string, painted: PaintedPixels): void {
    this.pending.delete(id);
    if (this.destroyed) return;
    const key = this.key(id);
    // painted on arrival meanwhile: that one is already on screen
    if (this.options.textures.exists(key)) return;
    const canvas = (this.options.canvas ?? domCanvas)(painted);
    if (!canvas) return;
    this.options.textures.addCanvas(key, canvas);
    this.held.add(id);
    this.options.onPainted?.(id);
  }
}
