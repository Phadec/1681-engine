import { Container, RenderTexture, Sprite, Texture } from 'pixi.js';
import type { Stage } from '../core/Stage';

/** A light in the world. Change its fields any time (follow a body by writing `x`/`y` each frame). */
export interface Light {
  x: number;
  y: number;
  /** World px. */
  radius: number;
  /** The colour it casts on what it lights (default warm white). */
  color?: number;
  /** 0–1: how much of the dark it takes away, and how strong its colour (default 1). */
  intensity?: number;
  /** Radius wobble, 0–1 (a torch ≈ 0.08). */
  flicker?: number;
  /** A light off is kept but not drawn. */
  on?: boolean;
}

export interface LightLayerOptions {
  /** Colour of the dark (default deep blue). */
  ambient?: number;
  /** 0 no dark at all, 1 black where nothing is lit (default 0.85). */
  darkness?: number;
  /** How strongly lights tint what they light, 0–1 (default 0.35). */
  tint?: number;
  /** A light's height over its width: the ground is seen at a slant (default 1, round; a 3/4 view ≈ 0.85). */
  squash?: number;
}

let gradient: Texture | null = null;

/** One soft radial falloff, white with alpha, shared by every light. */
function falloff(): Texture {
  if (gradient) return gradient;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Texture.EMPTY;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // a bright core and a long, eased tail: reads as light, not as a disc
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  gradient = Texture.from(canvas);
  gradient.source.scaleMode = 'linear';
  return gradient;
}

/**
 * Smooth darkness with lights cut out of it, for art that is not pixel art (the pixel module has its own dithered
 * `Darkness`). The dark is a screen-sized texture: each light erases a soft hole in it, and lays its colour over what
 * shows through. It sits on the screen layer, over the world and under the HUD you add after it.
 *
 * ```ts
 * const night = new LightLayer(stage, { darkness: 0.9 });
 * const torch = night.add({ x: 100, y: 80, radius: 90, color: 0xffb060, flicker: 0.08 });
 * // each frame: torch.x = hero.x; night.update(now);
 * ```
 */
export class LightLayer {
  private readonly lights = new Set<Light>();
  private readonly scratch = new Container();
  private readonly sheet = new Sprite(Texture.WHITE);
  private readonly holes = new Container();
  private readonly washes = new Container();
  private readonly view: Sprite;
  private rt: RenderTexture;
  private readonly pool: { hole: Sprite; wash: Sprite }[] = [];
  private ambient: number;
  private darkness: number;
  private readonly tint: number;
  private readonly squash: number;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly stage: Stage,
    options: LightLayerOptions = {},
  ) {
    this.ambient = options.ambient ?? 0x0a0c24;
    this.darkness = options.darkness ?? 0.85;
    this.tint = options.tint ?? 0.35;
    this.squash = options.squash ?? 1;
    this.scratch.addChild(this.sheet, this.holes);
    this.rt = RenderTexture.create({ width: 1, height: 1 });
    this.view = new Sprite(this.rt);
    // the colour washes sit over the dark, added to what they light
    this.washes.blendMode = 'add';
    stage.screen.addChild(this.view, this.washes);
    this.unsubscribe = stage.onResize(() => this.fit());
    this.fit();
  }

  add(light: Light): Light {
    this.lights.add(light);
    return light;
  }

  remove(light: Light): void {
    this.lights.delete(light);
  }

  clear(): void {
    this.lights.clear();
  }

  /** Changes the dark: its colour and how dark (a day/night cycle eases these). */
  setAmbient(color: number, darkness: number): void {
    this.ambient = color;
    this.darkness = Math.min(1, Math.max(0, darkness));
  }

  /** Redraws the dark with this frame's lights. Call once a frame, after the camera moved. */
  update(now = performance.now()): void {
    const on = this.darkness > 0.004;
    this.view.visible = on;
    this.washes.visible = on;
    if (!on) return;
    const cam = this.stage.cameras.main;
    const z = cam.zoom;
    this.sheet.tint = this.ambient;
    this.sheet.alpha = this.darkness;
    let used = 0;
    for (const l of this.lights) {
      if (l.on === false || l.radius <= 0) continue;
      const sx = (l.x - cam.scrollX) * z;
      const sy = (l.y - cam.scrollY) * z;
      const wobble = l.flicker ? 1 + Math.sin(now / 97 + l.x) * Math.sin(now / 53 + l.y) * l.flicker : 1;
      const r = l.radius * z * wobble;
      // off screen by more than its radius: nothing of it shows
      if (sx < -r || sy < -r || sx > cam.width + r || sy > cam.height + r) continue;
      const s = this.sprites(used++);
      const intensity = Math.min(1, Math.max(0, l.intensity ?? 1));
      for (const sprite of [s.hole, s.wash]) {
        sprite.visible = true;
        sprite.position.set(sx, sy);
        sprite.width = r * 2;
        sprite.height = r * 2 * this.squash;
      }
      s.hole.alpha = intensity;
      s.wash.tint = l.color ?? 0xfff0dc;
      s.wash.alpha = intensity * this.tint;
    }
    for (let i = used; i < this.pool.length; i++) {
      this.pool[i]!.hole.visible = false;
      this.pool[i]!.wash.visible = false;
    }
    this.stage.app.renderer.render({ container: this.scratch, target: this.rt, clear: true });
  }

  destroy(): void {
    this.unsubscribe();
    this.view.destroy();
    this.washes.destroy({ children: true });
    this.scratch.destroy({ children: true });
    this.rt.destroy(true);
    this.lights.clear();
  }

  private sprites(i: number): { hole: Sprite; wash: Sprite } {
    let s = this.pool[i];
    if (!s) {
      const hole = new Sprite(falloff());
      hole.anchor.set(0.5);
      hole.blendMode = 'erase';
      const wash = new Sprite(falloff());
      wash.anchor.set(0.5);
      this.holes.addChild(hole);
      this.washes.addChild(wash);
      s = { hole, wash };
      this.pool.push(s);
    }
    return s;
  }

  private fit(): void {
    const w = Math.max(1, Math.ceil(this.stage.width));
    const h = Math.max(1, Math.ceil(this.stage.height));
    this.rt.resize(w, h);
    this.sheet.width = w;
    this.sheet.height = h;
  }
}
