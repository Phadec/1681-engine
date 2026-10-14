import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import type { ComponentType, World } from '../ecs/World';
import type { Engine } from '../engine/Engine';
import { DrawCallCounter } from './DrawCallCounter';
import { ErrorLog } from './ErrorLog';
import { FrameStats } from './FrameStats';
import { inspectWorld } from './inspectWorld';

/** Draws one box in world coordinates (a hurtbox, a wall, a trigger), in `color` (default green). */
export type BoxDrawer = (x: number, y: number, width: number, height: number, color?: number) => void;

/** Draws one line in world coordinates (a turned collider's edge, a ray), in `color` (default green). */
export type LineDrawer = (x0: number, y0: number, x1: number, y1: number, color?: number) => void;

export interface DebugOverlayOptions {
  /**
   * `KeyboardEvent.code` that shows and hides it (default 'Backquote'). The key's own browser action is prevented
   * (F3 would open the find bar, F12 the developer tools).
   */
  key?: string;
  /** The world to count and inspect (default the current scene's). */
  world?: () => World | undefined;
  /** Component types the inspector lists; none, and it lists every entity with all it holds. */
  components?: readonly ComponentType<unknown>[];
  /** Entities listed at most (default 12). */
  inspectLimit?: number;
  /** Called every shown frame to draw collision boxes (and lines: turned shapes, rays). */
  colliders?: (draw: BoxDrawer, line: LineDrawer) => void;
  /** Errors kept (default 8). */
  errors?: number;
  /** Where the key is listened for (default `window`). */
  target?: Window | HTMLElement;
}

const GRAPH_W = 180;
const GRAPH_H = 40;
/** Text is rebuilt this often: a Pixi `Text` re-rasterises on every change, which would cost more than it measures. */
const TEXT_MS = 250;

/**
 * A developer overlay toggled by a key: FPS with a frame-time graph, draw calls and textures, the entity count, a
 * list of entities and their components, collision boxes, and the last errors the frame guard caught.
 *
 * Hidden, it costs nothing per frame: nothing is drawn or listened to but the key and the engine's `error` event
 * (so faults from before it was opened are still listed). Shown, it rides the engine's `frame` event.
 */
export class DebugOverlay {
  readonly errors: ErrorLog;
  private readonly stats = new FrameStats(GRAPH_W / 2);
  private readonly panel = new Container();
  private readonly back = new Sprite(Texture.WHITE);
  private readonly graph = new Graphics();
  private readonly text = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 11, fill: 0xe8e8e8, lineHeight: 13 } });
  private readonly boxes = new Graphics();
  private readonly boxLayer = new Container();
  private readonly draws: DrawCallCounter;
  private readonly cleanup: (() => void)[] = [];
  private offFrame: (() => void) | null = null;
  private lastText = -Infinity;
  private drawCalls = 0;
  private shown = false;
  private readonly drawBox: BoxDrawer = (x, y, w, h, color = 0x40ff60) => {
    this.boxes.rect(x, y, w, h).stroke({ width: 1, color, alpha: 0.9, pixelLine: true });
  };

  private readonly drawLine: LineDrawer = (x0, y0, x1, y1, color = 0x40ff60) => {
    this.boxes.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 1, color, alpha: 0.9, pixelLine: true });
  };

  constructor(
    private readonly engine: Engine,
    private readonly options: DebugOverlayOptions = {},
  ) {
    this.errors = new ErrorLog(options.errors ?? 8);
    this.draws = new DrawCallCounter(engine.app.renderer);
    this.back.tint = 0x000000;
    this.back.alpha = 0.7;
    this.graph.position.set(6, 6);
    this.text.position.set(6, GRAPH_H + 12);
    this.panel.addChild(this.back, this.graph, this.text);
    this.boxLayer.addChild(this.boxes);
    this.cleanup.push(engine.events.on('error', ({ where, error }) => this.errors.add(where, error)));
    const target = options.target ?? window;
    const key = options.key ?? 'Backquote';
    const onKey = (e: Event) => {
      const k = e as KeyboardEvent;
      if (k.code !== key) return;
      // the overlay's key, not the browser's: F3 opened find-in-page over the game
      k.preventDefault();
      if (!k.repeat) this.toggle();
    };
    target.addEventListener('keydown', onKey);
    this.cleanup.push(() => target.removeEventListener('keydown', onKey));
  }

  get visible(): boolean {
    return this.shown;
  }

  toggle(): void {
    if (this.shown) this.hide();
    else this.show();
  }

  show(): void {
    if (this.shown) return;
    this.shown = true;
    const stage = this.engine.stage;
    stage.screen.addChild(this.boxLayer, this.panel);
    stage.cameras.main.follow(this.boxLayer);
    this.draws.install();
    this.draws.take();
    this.stats.clear();
    this.lastText = -Infinity;
    this.offFrame = this.engine.events.on('frame', ({ now, dt }) => this.frame(now, dt));
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.offFrame?.();
    this.offFrame = null;
    this.draws.uninstall();
    this.engine.stage.cameras.main.unfollow(this.boxLayer);
    this.panel.removeFromParent();
    this.boxLayer.removeFromParent();
    this.boxes.clear();
  }

  destroy(): void {
    this.hide();
    for (const fn of this.cleanup.splice(0)) fn();
    this.panel.destroy({ children: true });
    this.boxLayer.destroy({ children: true });
  }

  private frame(now: number, dt: number): void {
    this.stats.push(dt * 1000);
    // counted while the previous frame rendered: the 'frame' event comes before this frame's render
    this.drawCalls = this.draws.take();
    this.paintGraph();
    this.boxes.clear();
    if (this.options.colliders) this.options.colliders(this.drawBox, this.drawLine);
    if (now - this.lastText >= TEXT_MS) {
      this.lastText = now;
      this.paintText();
    }
  }

  private paintGraph(): void {
    const g = this.graph.clear();
    g.rect(0, 0, GRAPH_W, GRAPH_H).fill({ color: 0x202020 });
    // 16.7 ms (60 fps) and 33.3 ms (30 fps) guides; the graph tops out at 50 ms
    for (const ms of [1000 / 60, 1000 / 30]) g.rect(0, GRAPH_H - (ms / 50) * GRAPH_H, GRAPH_W, 1).fill({ color: 0x505050 });
    const n = this.stats.count;
    for (let i = 0; i < n; i++) {
      const ms = this.stats.at(i);
      const h = Math.max(1, Math.min(GRAPH_H, Math.round((ms / 50) * GRAPH_H)));
      const color = ms > 1000 / 30 ? 0xff5050 : ms > 1000 / 55 ? 0xffc040 : 0x60e070;
      g.rect(i * 2, GRAPH_H - h, 2, h).fill({ color });
    }
  }

  private paintText(): void {
    const renderer = this.engine.app.renderer;
    const world = this.options.world ? this.options.world() : this.engine.scene?.world;
    const lines: string[] = [
      `${this.stats.fps.toFixed(0)} fps  avg ${this.stats.average.toFixed(1)} ms  max ${this.stats.max.toFixed(1)} ms`,
      `draw calls ${this.draws.supported ? this.drawCalls : 'n/a'}  textures ${textureCount(renderer)}`,
      `entities ${world ? world.size : '-'}  scene ${this.engine.scene?.constructor.name ?? '-'}`,
    ];
    if (world) {
      for (const row of inspectWorld(world, this.options.components, this.options.inspectLimit ?? 12)) lines.push(`#${row.entity} ${row.components.join(' | ')}`);
    }
    if (this.errors.entries.length) {
      lines.push('errors:');
      for (const e of this.errors.entries) lines.push(`${e.count > 1 ? `${e.count}x ` : ''}${e.where}: ${e.message}`.slice(0, 120));
    }
    this.text.text = lines.join('\n');
    this.back.width = Math.max(GRAPH_W + 12, Math.ceil(this.text.width) + 12);
    this.back.height = Math.ceil(this.text.y + this.text.height + 6);
  }
}

/** Textures the renderer holds on the GPU; the WebGL and WebGPU systems expose it, the canvas fallback does not. */
function textureCount(renderer: Renderer): number | string {
  const managed = (renderer.texture as { managedTextures?: readonly unknown[] }).managedTextures;
  return managed ? managed.length : 'n/a';
}
