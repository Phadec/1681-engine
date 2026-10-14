import { Application, TextureSource } from 'pixi.js';
import { Stage } from '../core/Stage';
import { TextureRegistry } from '../core/TextureRegistry';
import { patchPixi } from '../core/pixiPatches';
import { EventBus } from '../events/EventBus';
import { followReducedMotion } from '../platform/reducedMotion';
import { FixedLoop } from './FixedLoop';
import { HiddenPause } from './HiddenPause';
import { SceneManager } from './SceneManager';
import type { Scene } from './Scene';

export interface EngineOptions {
  /** Where the canvas goes. */
  parent: HTMLElement;
  /** A fixed canvas size in CSS pixels. Leave both out to fill `parent` and follow its size. */
  width?: number;
  height?: number;
  /** CSS colour behind the world (default black). */
  background?: string;
  /** World pixels are drawn this many screen pixels wide (default 1). Whole numbers keep pixel art crisp. */
  zoom?: number;
  /** Simulation steps per second (default 60). */
  hz?: number;
  /** Textures shared by the stage; a fresh registry by default. */
  textures?: TextureRegistry;
  /**
   * Pixel art: nearest-neighbour textures, no antialiasing, one backing pixel per CSS pixel, and a camera that lands
   * on whole pixels (default false: smooth textures drawn at the screen's own density, for any other art style).
   */
  pixelPerfect?: boolean;
  /** Backing pixels per CSS pixel when not `pixelPerfect` (default `devicePixelRatio`, at most 2). */
  resolution?: number;
  /**
   * Renderer preference (default 'webgl'). WebGL 2 runs everywhere the engine is tested. 'webgpu' is experimental:
   * Pixi falls back to WebGL where WebGPU is missing, but the engine's own paths (pooled `PixelLayer` buffers, the
   * `erase` blend `Darkness` cuts lights with, the fill filters) have only been profiled on WebGL.
   */
  preference?: 'webgl' | 'webgpu';
  /**
   * Pause simulating and drawing while the page is hidden (another tab, the phone's home screen) and resume when it
   * is shown, with no catch-up burst of steps (default false). A pause the game made itself is left alone.
   */
  pauseWhenHidden?: boolean;
  /**
   * Mirror the system's "reduce motion" setting into `engineSettings.reducedFx`, now and on every change (default
   * false). Leave it off when the game has its own reduced-effects toggle and mirrors that instead.
   */
  followReducedMotion?: boolean;
}

export interface EngineEvents {
  /** Something a guarded step or a system threw; the frame carried on. */
  error: { where: string; error: unknown };
  /** After every rendered frame's update, before Pixi renders. */
  frame: { now: number; dt: number };
}

/** The stage the engine drives: its per-frame update is the engine's tick. */
class EngineStage extends Stage {
  constructor(
    app: Application,
    textures: TextureRegistry,
    private readonly tick: (now: number, delta: number) => void,
  ) {
    super(app, textures);
  }

  override update(now: number, delta: number): void {
    this.tick(now, delta);
  }
}

/**
 * The top of the engine: a Pixi application, the `Stage` (world and screen layers, camera, tweens, timers,
 * pointer), a fixed-step simulation loop and a stack of scenes.
 *
 * ```ts
 * const engine = await Engine.create({ parent: document.body, zoom: 3 });
 * await engine.scenes.replace(new MyLevel());
 * ```
 */
export class Engine {
  readonly stage: Stage;
  readonly loop: FixedLoop;
  readonly scenes: SceneManager;
  readonly events = new EventBus<EngineEvents>();
  private running = true;
  private destroyed = false;
  /** Pauses through the loop's own switch, so a hidden tab never counts as the game's own pause (`forget`). */
  private readonly hiddenPause = this.makeHiddenPause();
  private readonly unwatch: (() => void)[] = [];
  private readonly onTick = (t: { deltaMS: number }) => this.stage.frame(t.deltaMS);

  private constructor(
    readonly app: Application,
    textures: TextureRegistry,
    options: EngineOptions,
  ) {
    this.loop = new FixedLoop(options.hz === undefined ? {} : { hz: options.hz });
    this.stage = new EngineStage(app, textures, (now, delta) => this.tick(now, delta));
    const cam = this.stage.cameras.main;
    cam.setZoom(options.zoom ?? 1);
    cam.defaultZoom = cam.zoom;
    cam.roundPixels = options.pixelPerfect === true;
    cam.resolution = app.renderer.resolution;
    this.scenes = new SceneManager(this);
    Stage.onCaught = (where, error) => this.events.emit('error', { where, error });
    app.ticker.add(this.onTick);
    if (options.pauseWhenHidden === true) this.unwatch.push(this.hiddenPause.watch());
    if (options.followReducedMotion === true) this.unwatch.push(followReducedMotion());
  }

  static async create(options: EngineOptions): Promise<Engine> {
    const pixel = options.pixelPerfect === true;
    TextureSource.defaultOptions.scaleMode = pixel ? 'nearest' : 'linear';
    const resolution = pixel ? 1 : (options.resolution ?? Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    patchPixi();
    const app = new Application();
    const fill = options.width === undefined && options.height === undefined;
    await app.init({
      ...(fill ? { resizeTo: options.parent } : { width: options.width ?? 800, height: options.height ?? 600 }),
      background: options.background ?? '#000000',
      antialias: !pixel,
      resolution,
      autoDensity: true,
      preference: options.preference ?? 'webgl',
    });
    options.parent.appendChild(app.canvas);
    return new Engine(app, options.textures ?? new TextureRegistry(), options);
  }

  /** The scene that updates now, if any. */
  get scene(): Scene | undefined {
    return this.scenes.current;
  }

  /** Stops simulating and drawing; the canvas keeps its last frame. */
  pause(): void {
    this.hiddenPause.forget();
    this.pauseLoop();
  }

  resume(): void {
    this.hiddenPause.forget();
    this.resumeLoop();
  }

  private makeHiddenPause(): HiddenPause {
    // the getter below needs the engine, not the object literal it sits in
    const engine = this;
    return new HiddenPause({
      get paused() {
        return !engine.running;
      },
      pause: () => engine.pauseLoop(),
      resume: () => engine.resumeLoop(),
    });
  }

  private pauseLoop(): void {
    if (!this.running) return;
    this.running = false;
    this.app.ticker.stop();
  }

  private resumeLoop(): void {
    if (this.running || this.destroyed) return;
    this.running = true;
    // the time away is not owed: the loop starts with no debt, and Pixi's ticker measures its next frame from the
    // moment it starts again (`start` resets its last time), so the first frame back is an ordinary one
    this.loop.reset();
    this.app.ticker.start();
  }

  get paused(): boolean {
    return !this.running;
  }

  /** Reports a fault to `events.error` (and the console when nobody listens). */
  reportError(where: string, error: unknown): void {
    if (this.events.listenerCount('error') === 0) console.error(`[engine] ${where}`, error);
    this.events.emit('error', { where, error });
  }

  /** Leaves every scene, removes the canvas and frees the renderer. */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const off of this.unwatch.splice(0)) off();
    await this.scenes.clear();
    this.app.ticker.remove(this.onTick);
    if (Stage.onCaught) Stage.onCaught = null;
    this.stage.destroy();
    this.events.clear();
    this.app.destroy({ removeView: true }, { children: true });
  }

  private tick(now: number, delta: number): void {
    const scene = this.scenes.current;
    if (scene) {
      const report = (s: { name: string }, err: unknown) => this.reportError(`system ${s.name}`, err);
      const step = this.loop.stepSeconds;
      const alpha = this.loop.advance(delta, () => {
        scene.world.run('fixed', { dt: step, now, alpha: 0 }, report);
        scene.fixedUpdate(step);
      });
      const dt = delta / 1000;
      scene.world.run('frame', { dt, now, alpha }, report);
      scene.update(dt, alpha);
    }
    this.events.emit('frame', { now, dt: delta / 1000 });
  }
}
