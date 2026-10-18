import { Container, type Application } from 'pixi.js';
import { Camera } from './Camera';
import { Clock } from './Clock';
import { deferDepthSort, flushDepthSorts } from './depthSort';
import { ObjectFactory } from './ObjectFactory';
import { PixelGrid } from './PixelGrid';
import { Pointer } from './Pointer';
import type { TextureRegistry } from './TextureRegistry';
import { Tweener } from './Tweener';

/**
 * What a world object is created in: a world layer the camera moves (children sorted by depth), a screen layer
 * above it, and the per-frame services (tweens, timers, camera, pointer). Subclasses implement `update`.
 */
export abstract class Stage {
  /** Told of every fault a guarded step caught (error telemetry, if the game sets one). */
  static onCaught: ((where: string, err: unknown) => void) | null = null;

  readonly world = new Container({ sortableChildren: true });
  readonly screen = new Container();
  readonly add = new ObjectFactory(this);
  readonly tweens = new Tweener();
  readonly time = new Clock();
  readonly cameras: { main: Camera };
  readonly input: { activePointer: Pointer };
  /**
   * Pixel-perfect: the world drawn one texel to a world pixel and scaled up by the camera's zoom (`PixelGrid`), so turned,
   * scaled and between-pixels art lands on one grid; text made by `add.text`/`add.label` stays at screen resolution.
   * Off (the default), the world is drawn straight at the zoom. Takes effect on the next frame; may be switched any time.
   */
  pixelPerfect = false;
  /**
   * Texels of the pixel-perfect grid to a world pixel (whole, 1 by default). A game whose characters are drawn finer
   * than its world pixel (two art pixels to one) sets 2, so the grid keeps their detail; everything else still lands on
   * that finer grid.
   */
  pixelDensity = 1;
  private readonly grid: PixelGrid;
  /** Whether the grid drew last frame, so the frame it is switched off still takes it down. */
  private gridLive = false;
  private readonly resizeListeners: (() => void)[] = [];
  private lastWidth = 0;
  private lastHeight = 0;

  constructor(
    readonly app: Application,
    readonly textures: TextureRegistry,
  ) {
    app.stage.addChild(this.world, this.screen);
    // the world sorts by depth once a frame, rebuilding Pixi's draw instructions only when the order changed
    deferDepthSort(this.world);
    this.cameras = { main: new Camera(this.world, this.screen) };
    this.input = { activePointer: new Pointer(app.canvas) };
    this.grid = new PixelGrid(app, this.world);
    // a timer's throw is a fault like any guarded step's: logged once and told to `onCaught`
    this.time.onError = (err) => this.caught('timers', err);
    this.syncSize();
  }

  get width(): number {
    return this.app.screen.width;
  }

  get height(): number {
    return this.app.screen.height;
  }

  get fps(): number {
    return this.app.ticker.FPS;
  }

  /** Calls `fn` whenever the window changes size; the returned function stops it (a per-map listener must). */
  onResize(fn: () => void): () => void {
    this.resizeListeners.push(fn);
    return () => {
      const i = this.resizeListeners.indexOf(fn);
      if (i >= 0) this.resizeListeners.splice(i, 1);
    };
  }

  abstract update(now: number, delta: number): void;

  /**
   * One frame: game logic, then tweens and timers, then the camera. Pixi renders after. Each step is guarded: a
   * ticker listener that throws never asks for the next animation frame, so one bad frame used to stop the world for
   * good — the canvas frozen and no input reaching the server (seen on Android).
   */
  frame(delta: number): void {
    const now = performance.now();
    this.guard('resize', () => this.syncSize());
    this.guard('update', () => this.update(now, delta));
    this.guard('tweens', () => this.tweens.update(delta));
    this.guard('timers', () => this.time.update(now));
    this.guard('camera', () => this.cameras.main.apply(now));
    this.guard('depth', flushDepthSorts);
    // only while it is on, and the frame it is switched off
    if (this.pixelPerfect || this.gridLive) {
      this.gridLive = this.pixelPerfect;
      this.guard('pixel grid', () => this.grid.render(this.cameras.main, this.pixelPerfect, this.pixelDensity));
    }
  }

  /**
   * Keeps a piece of text made outside `add.text`/`add.label` (put on the world any way) at screen resolution while the
   * world is pixel-perfect. Those two do it themselves.
   */
  keepSharp(obj: Container): void {
    this.grid.text.track(obj);
  }

  private readonly reported = new Set<string>();

  /**
   * Runs one step of a frame and swallows what it throws, so the steps after it still run. Subclasses guard the parts
   * of their own `update` too: a fault before the camera follows the player used to leave the view standing on one
   * spot while the world went on.
   */
  protected guard(step: string, fn: () => void): void {
    this.guarded(step, fn, undefined);
  }

  /** `guard` for a step that answers something: `fallback` when it threw. */
  protected guarded<T>(step: string, fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (err) {
      this.caught(step, err);
      return fallback;
    }
  }

  /** What a guarded step threw: logged once per distinct error, or a fault repeating every frame floods the log at 60 a second. */
  protected caught(step: string, err: unknown): void {
    const key = `${step}|${err instanceof Error ? err.message : String(err)}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    console.error(`[frame] ${step} failed`, err);
    // caught here, so the window's error listener never hears of it: tell the telemetry ourselves
    Stage.onCaught?.(`[frame] ${step}`, err);
  }

  destroy(): void {
    this.tweens.clear();
    this.time.clear();
    this.input.activePointer.destroy();
    // the labels go back to their containers first, so the world's destroy takes them
    this.grid.destroy(this.cameras.main);
    this.world.destroy({ children: true, context: true });
    this.screen.destroy({ children: true, context: true });
  }

  private syncSize(): void {
    const { width, height } = this.app.screen;
    const cam = this.cameras.main;
    cam.width = width;
    cam.height = height;
    if (width === this.lastWidth && height === this.lastHeight) return;
    this.lastWidth = width;
    this.lastHeight = height;
    // a copy: a listener may unsubscribe itself (or another) while they run
    for (const fn of [...this.resizeListeners]) fn();
  }
}
