import { Matrix, RenderTexture, Sprite, type Application, type Container } from 'pixi.js';
import type { Camera } from './Camera';
import { gridPlacement } from './gridPlacement';
import { SharpText } from './SharpText';

/**
 * A pixel-perfect world (`Stage.pixelPerfect`): the world layer is taken off the stage and drawn each frame into a
 * texture of one texel per world pixel, whose origin sits on a whole world pixel, then shown at the camera's zoom and
 * moved by the scroll's fraction, so the camera still glides one backing pixel at a time. Everything turned, scaled or
 * placed between pixels lands on the same grid as the rest of the art, so no pixel on screen is drawn at another size
 * ("mixels"); the world is also filled at 1/zoom² of the screen's pixels. Roots placed with `Camera.snapRoot` land on
 * whole world pixels meanwhile, and text stays at screen resolution (`SharpText`).
 */
export class PixelGrid {
  private texture: RenderTexture | null = null;
  private sprite: Sprite | null = null;
  readonly text: SharpText;
  private readonly transform = new Matrix();
  private on = false;

  constructor(
    private readonly app: Application,
    private readonly world: Container,
  ) {
    this.text = new SharpText(world);
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Once a frame, after the camera wrote the world's transform and before Pixi draws the screen. */
  render(cam: Camera, enabled: boolean): void {
    if (enabled !== this.on) {
      if (enabled) this.enable(cam);
      else this.disable(cam);
    }
    if (!enabled) return;
    const zoom = cam.zoom || 1;
    // where the camera put the world's origin on screen: the scroll rounded to a backing pixel, plus this frame's shake
    const origin = this.world.position;
    const at = gridPlacement(origin.x, origin.y, zoom, this.app.renderer.resolution, cam.width, cam.height);
    const texture = this.fit(at.width, at.height);
    this.transform.set(1, 0, 0, 1, -at.tx, -at.ty);
    this.app.renderer.render({ container: this.world, target: texture, clear: true, clearColor: [0, 0, 0, 0], transform: this.transform });
    const sprite = this.sprite!;
    sprite.scale.set(zoom);
    sprite.position.set(at.x, at.y);
    this.text.sync(origin, zoom);
  }

  destroy(cam: Camera): void {
    this.disable(cam);
    this.text.destroy();
  }

  private enable(cam: Camera): void {
    this.on = true;
    cam.pixelGrid = true;
    const stage = this.app.stage;
    const at = Math.max(0, stage.children.indexOf(this.world));
    stage.removeChild(this.world);
    this.sprite = new Sprite();
    stage.addChildAt(this.sprite, at);
    stage.addChildAt(this.text.layer, at + 1);
  }

  private disable(cam: Camera): void {
    if (!this.on) return;
    this.on = false;
    cam.pixelGrid = false;
    this.text.release();
    const stage = this.app.stage;
    const at = Math.max(0, this.sprite ? stage.children.indexOf(this.sprite) : 0);
    stage.removeChild(this.text.layer);
    this.sprite?.destroy();
    this.sprite = null;
    this.texture?.destroy(true);
    this.texture = null;
    if (!this.world.destroyed) stage.addChildAt(this.world, at);
  }

  /** The texture at exactly this size, made again only when the screen or the zoom changed. */
  private fit(w: number, h: number): RenderTexture {
    if (this.texture && this.texture.width === w && this.texture.height === h) return this.texture;
    this.texture?.destroy(true);
    this.texture = RenderTexture.create({ width: w, height: h, resolution: 1, scaleMode: 'nearest', antialias: false });
    this.sprite!.texture = this.texture;
    return this.texture;
  }
}
