import { Container, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { placeAxis, wrap, type AxisInput, type AxisPlacement } from './parallaxMath';

/** What a parallax layer reads off the camera each frame; the engine's `Camera` has all of it. */
export interface ParallaxCamera {
  readonly scrollX: number;
  readonly scrollY: number;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  /** Set on a pixel-perfect engine: a layer then lands on whole world pixels unless told otherwise. */
  readonly roundPixels?: boolean;
}

export interface ParallaxLayerOptions {
  /**
   * A texture to draw, repeated along the axes `repeatX` / `repeatY` name (one tiling sprite, as wide as the view
   * whatever the level's length). Give either this or `display`.
   */
  texture?: Texture;
  /** Anything already drawn (a sprite, a `Graphics`, a container of them), drawn once and never repeated. */
  display?: Container;
  /** Share of the camera's horizontal travel the layer moves on screen: 0 fixed to the screen, 1 with the world (default 0.5). */
  factorX?: number;
  /** The same vertically (default: `factorX`). */
  factorY?: number;
  /** Repeat the texture left and right forever (a `texture` layer only). */
  repeatX?: boolean;
  /** Repeat the texture up and down forever (a `texture` layer only). */
  repeatY?: boolean;
  /** World px added to the layer's position, e.g. where on the level a row of hills stands. */
  offsetX?: number;
  offsetY?: number;
  /** Drift, world px a second, on top of the parallax (clouds). */
  speedX?: number;
  speedY?: number;
  /** Land on whole world pixels (default: the camera's `roundPixels`, i.e. a pixel-perfect engine). */
  snap?: boolean;
  /** Hide the layer while none of it is in view (default true). Repeated layers always fill the view. */
  cull?: boolean;
  /** Order among the parallax's layers: lower draws further back (default: the order they were added in). */
  depth?: number;
}

/**
 * One layer of a `Parallax`: a texture or a display object that scrolls at a share of the camera's speed, optionally
 * repeated and drifting. `view` goes into the world layer (the parallax adds it), so the camera's zoom and pixel
 * rounding apply to it like to any world object; the layer only moves it.
 */
export class ParallaxLayer {
  readonly view = new Container();
  factorX: number;
  factorY: number;
  offsetX: number;
  offsetY: number;
  speedX: number;
  speedY: number;
  snap: boolean | undefined;
  cull: boolean;
  /** The depth it was given, if any (a `Parallax` numbers the others in the order they were added). */
  readonly depth: number | undefined;
  private readonly repeatX: boolean;
  private readonly repeatY: boolean;
  private readonly tiling: TilingSprite | null = null;
  private readonly tileW: number = 0;
  private readonly tileH: number = 0;
  /** The content's local bounds, measured once: reading bounds every frame walks the whole display tree. */
  private boundsX = 0;
  private boundsY = 0;
  private boundsW = 0;
  private boundsH = 0;
  private driftX = 0;
  private driftY = 0;
  // scratch, so a frame allocates nothing
  private readonly input: AxisInput = { scroll: 0, view: 0, factor: 0, offset: 0, repeat: false, tile: 0, contentStart: 0, contentSize: 0, snap: false };
  private readonly px: AxisPlacement = { position: 0, size: 0, phase: 0, visible: true };
  private readonly py: AxisPlacement = { position: 0, size: 0, phase: 0, visible: true };

  constructor(options: ParallaxLayerOptions) {
    const { texture, display } = options;
    if (!texture === !display) throw new Error('ParallaxLayer: give exactly one of `texture` and `display`');
    this.factorX = options.factorX ?? 0.5;
    this.factorY = options.factorY ?? this.factorX;
    this.offsetX = options.offsetX ?? 0;
    this.offsetY = options.offsetY ?? 0;
    this.speedX = options.speedX ?? 0;
    this.speedY = options.speedY ?? 0;
    this.snap = options.snap;
    this.cull = options.cull ?? true;
    this.repeatX = texture !== undefined && options.repeatX === true;
    this.repeatY = texture !== undefined && options.repeatY === true;
    this.depth = options.depth;
    if (options.depth !== undefined) this.view.zIndex = options.depth;
    if (texture) {
      this.tileW = texture.width;
      this.tileH = texture.height;
      if (this.repeatX || this.repeatY) {
        this.tiling = new TilingSprite({ texture, width: texture.width, height: texture.height });
        this.view.addChild(this.tiling);
      } else this.view.addChild(new Sprite(texture));
    } else if (display) this.view.addChild(display);
    this.remeasure();
  }

  /** Measures the content again, after it was redrawn larger or smaller (culling reads the measured size). */
  remeasure(): void {
    if (this.tiling) {
      this.boundsX = 0;
      this.boundsY = 0;
      this.boundsW = this.tileW;
      this.boundsH = this.tileH;
      return;
    }
    const b = this.view.getLocalBounds();
    this.boundsX = b.x;
    this.boundsY = b.y;
    this.boundsW = b.width;
    this.boundsH = b.height;
  }

  /** Places the layer for this frame; `dtMs` advances the drift. */
  update(camera: ParallaxCamera, dtMs: number): void {
    const seconds = dtMs / 1000;
    this.driftX += this.speedX * seconds;
    this.driftY += this.speedY * seconds;
    // a repeating drift only matters within one tile: kept there, it never grows until the floats lose pixels
    if (this.repeatX) this.driftX = wrap(this.driftX, this.tileW);
    if (this.repeatY) this.driftY = wrap(this.driftY, this.tileH);
    const snap = this.snap ?? camera.roundPixels === true;
    const zoom = camera.zoom > 0 ? camera.zoom : 1;
    const a = this.input;
    a.snap = snap;
    a.scroll = camera.scrollX;
    a.view = camera.width / zoom;
    a.factor = this.factorX;
    a.offset = this.offsetX + this.driftX;
    a.repeat = this.repeatX;
    a.tile = this.tileW;
    a.contentStart = this.boundsX;
    a.contentSize = this.boundsW;
    const x = placeAxis(this.px, a);
    a.scroll = camera.scrollY;
    a.view = camera.height / zoom;
    a.factor = this.factorY;
    a.offset = this.offsetY + this.driftY;
    a.repeat = this.repeatY;
    a.tile = this.tileH;
    a.contentStart = this.boundsY;
    a.contentSize = this.boundsH;
    const y = placeAxis(this.py, a);
    this.view.position.set(x.position, y.position);
    const tiling = this.tiling;
    if (tiling) {
      const w = this.repeatX ? x.size : this.tileW;
      const h = this.repeatY ? y.size : this.tileH;
      // resized only when the view's size changed: a resize marks the sprite's geometry dirty for the renderer
      if (tiling.width !== w || tiling.height !== h) tiling.setSize(w, h);
      tiling.tilePosition.set(x.phase, y.phase);
    }
    // a camera that has no size yet (before the first resize) shows everything rather than nothing
    const sized = camera.width > 0 && camera.height > 0;
    this.view.visible = !this.cull || !sized || (x.visible && y.visible);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
