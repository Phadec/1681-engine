import { Application, TextureSource } from 'pixi.js';
import { Stage } from '../core/Stage';
import { TextureRegistry } from '../core/TextureRegistry';
import { patchPixi } from '../core/pixiPatches';
import { EventBus } from '../events/EventBus';
import { FixedLoop } from './FixedLoop';
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
  /** Nearest-neighbour sampling for every texture, the pixel-art default (default true). */
  pixelArt?: boolean;
  /**
   * Renderer preference (default 'webgl'). WebGL 2 runs everywhere the engine is tested. 'webgpu' is experimental:
   * Pixi falls back to WebGL where WebGPU is missing, but the engine's own paths (pooled `PixelLayer` buffers, the
   * `erase` blend `Darkness` cuts lights with, the fill filters) have only been profiled on WebGL.
   */
  preference?: 'webgl' | 'webgpu';
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
  private readonly onTick = (t: { deltaMS: number }) => this.stage.frame(t.deltaMS);

  private constructor(
    readonly app: Application,
    textures: TextureRegistry,
    options: EngineOptions,
  ) {
    this.loop = new FixedLoop(options.hz === undefined ? {} : { hz: options.hz });
    this.stage = new EngineStage(app, textures, (now, delta) => this.tick(now, delta));
    this.stage.cameras.main.setZoom(options.zoom ?? 1);
    this.scenes = new SceneManager(this);
    Stage.onCaught = (where, error) => this.events.emit('error', { where, error });
    app.ticker.add(this.onTick);
  }

  static async create(options: EngineOptions): Promise<Engine> {
    if (options.pixelArt !== false) TextureSource.defaultOptions.scaleMode = 'nearest';
    patchPixi();
    const app = new Application();
    const fill = options.width === undefined && options.height === undefined;
    await app.init({
      ...(fill ? { resizeTo: options.parent } : { width: options.width ?? 800, height: options.height ?? 600 }),
      background: options.background ?? '#000000',
      antialias: false,
      resolution: 1,
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
    if (!this.running) return;
    this.running = false;
    this.app.ticker.stop();
  }

  resume(): void {
    if (this.running || this.destroyed) return;
    this.running = true;
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
