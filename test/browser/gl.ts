import { Application, type Container, type WebGLRenderer } from 'pixi.js';
import { Stage } from '../../src/core/Stage';
import { TextureRegistry } from '../../src/core/TextureRegistry';
import { patchPixi } from '../../src/core/pixiPatches';

/**
 * Helpers for the browser tests: a real WebGL Pixi application, and the canvas's pixels read back with `gl.readPixels`
 * straight after a render, so every assertion is on the colours the GPU actually drew.
 */

export type Rgba = [number, number, number, number];

/** A WebGL application `w` × `h` CSS px at one backing pixel per CSS pixel, on a black (or `background`) clear. */
export async function makeApp(w = 64, h = 64, background = '#000000'): Promise<Application> {
  patchPixi();
  const app = new Application();
  await app.init({ width: w, height: h, background, antialias: false, resolution: 1, preference: 'webgl', autoStart: false });
  document.body.appendChild(app.canvas);
  return app;
}

export function destroyApp(app: Application): void {
  app.destroy({ removeView: true }, { children: true });
}

/** The WebGL context under a renderer; throws when the renderer is not WebGL (the tests are about WebGL). */
export function glOf(app: Application): WebGL2RenderingContext | WebGLRenderingContext {
  const gl = (app.renderer as WebGLRenderer).gl;
  if (!gl) throw new Error('not a WebGL renderer');
  return gl;
}

/** Renders `container` (default the app's stage) to the canvas and reads every pixel back, top row first. */
export function renderAndRead(app: Application, container: Container = app.stage): Frame {
  app.renderer.render({ container });
  const gl = glOf(app);
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const raw = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  return new Frame(raw, w, h);
}

/** A frame read back from the GPU; `at` takes screen coordinates (y down). */
export class Frame {
  constructor(
    private readonly raw: Uint8Array,
    readonly width: number,
    readonly height: number,
  ) {}

  at(x: number, y: number): Rgba {
    // readPixels starts at the bottom row
    const p = ((this.height - 1 - y) * this.width + x) * 4;
    return [this.raw[p]!, this.raw[p + 1]!, this.raw[p + 2]!, this.raw[p + 3]!];
  }

  /** How many pixels in the box match `test`. */
  count(test: (c: Rgba) => boolean, x0 = 0, y0 = 0, x1 = this.width, y1 = this.height): number {
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (test(this.at(x, y))) n++;
    return n;
  }
}

/** `[r, g, b]` of a 0xrrggbb colour, opaque. */
export function rgb(color: number): Rgba {
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255, 255];
}

/** A `Stage` with no game logic of its own, over a real application. */
export class TestStage extends Stage {
  constructor(app: Application, textures = new TextureRegistry()) {
    super(app, textures);
  }

  override update(): void {}
}

/** A canvas painted by `paint`, the way an atlas page or a sprite comes out of an art tool. */
export function canvasOf(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  return c;
}

/** A canvas encoded as PNG and served from a blob: URL, so loaders fetch and decode it for real. */
export async function pngUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
  return URL.createObjectURL(blob);
}

export function jsonUrl(value: unknown): string {
  return URL.createObjectURL(new Blob([JSON.stringify(value)], { type: 'application/json' }));
}
