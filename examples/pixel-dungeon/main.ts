import {
  Actions,
  Engine,
  INPUT_FLAG_DASH,
  Keyboard,
  Scene,
  createCollisionGrid,
  createMover,
  stepMover,
  system,
  type CollisionGrid,
  type MoverState,
  type MovementParams,
} from '../../src';
import { Darkness, Evaporation, PackedPixels, addPixelLayer, flashLight, hash2, pixelPaint, type PixelLayer } from '../../src/pixel';

/*
 * The pixel module in one room: a dark dungeon lit by flickering torches whose light falls off in dithered steps, a
 * light the hero carries, and slimes that evaporate into their own pixels when struck (walk into one and press
 * Space or J). Everything is drawn into PixelLayers on the world's own 1-px grid.
 */

const TILE = 16;
const W = 26;
const H = 16;
const params: MovementParams = { speed: 64, dashSpeed: 190, dashSteps: 10, dashCooldownSteps: 36, canMove: true, canDash: true };

interface Slime {
  x: number;
  y: number;
  layer: PixelLayer;
  /** Its own pixels, relative to its feet: what it evaporates into. */
  pixels: { dx: number; dy: number; color: number }[];
  phase: number;
}

type Action = 'left' | 'right' | 'up' | 'down' | 'roll' | 'strike';

/** A slime's pixels: a gel dome in four tones, lit from the upper left, with two eyes. */
function slimePixels(hue: number): { dx: number; dy: number; color: number }[] {
  const ramp = [[0x1e4a2a, 0x2f7a3a, 0x52b04a, 0xa8e070], [0x2a2a6a, 0x3e4ab0, 0x6a86e0, 0xb8d0ff], [0x5a1e3a, 0x9a2e5a, 0xd25a7a, 0xffb0c0]][hue % 3]!;
  const out: { dx: number; dy: number; color: number }[] = [];
  for (let y = -9; y <= 0; y++) {
    for (let x = -7; x <= 7; x++) {
      const d = Math.hypot(x / 7, (y + 4.5) / 5);
      if (d > 1 || (y === 0 && Math.abs(x) > 5)) continue;
      const light = -x * 0.35 - (y + 4.5) * 0.45 + (1 - d) * 3;
      const tone = d > 0.86 ? 0 : light > 2.6 ? 3 : light > 0.4 ? 2 : 1;
      out.push({ dx: x, dy: y, color: ramp[tone]! });
    }
  }
  for (const ex of [-2, 2]) out.push({ dx: ex, dy: -5, color: 0x101018 }, { dx: ex, dy: -6, color: 0x101018 });
  return out;
}

class Dungeon extends Scene {
  private readonly keyboard = new Keyboard();
  private readonly input = new Actions<Action>(this.keyboard, {
    left: ['KeyA', 'ArrowLeft', 'pad:left', 'pad:lx-'],
    right: ['KeyD', 'ArrowRight', 'pad:right', 'pad:lx+'],
    up: ['KeyW', 'ArrowUp', 'pad:up', 'pad:ly-'],
    down: ['KeyS', 'ArrowDown', 'pad:down', 'pad:ly+'],
    roll: ['ShiftLeft', 'pad:b'],
    strike: ['Space', 'KeyJ', 'pad:a'],
  });
  private grid!: CollisionGrid;
  private dark!: Darkness;
  private evaporation!: Evaporation;
  private hero!: { mover: MoverState; layer: PixelLayer };
  private readonly slimes: Slime[] = [];
  private status = document.getElementById('status')!;
  private felled = 0;
  /** Sword arcs in flight: drawn with pixelPaint for a few frames, then gone. */
  private readonly swings: { layer: PixelLayer; born: number; dir: 1 | -1 }[] = [];

  override onEnter(): void {
    const { stage } = this.engine;
    let solid = '';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) solid += x === 0 || y <= 1 || x === W - 1 || y === H - 1 || (x % 8 === 4 && y > 4 && y < 11) ? '1' : '0';
    this.grid = createCollisionGrid(W, H, TILE, solid);
    stage.cameras.main.setBounds(0, 0, W * TILE, H * TILE);

    // the floor and walls, painted once: flagstones with a little noise, wall faces lit from above
    const floor = addPixelLayer(stage);
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const wall = solid[ty * W + tx] === '1';
        for (let py = 0; py < TILE; py++) {
          for (let px = 0; px < TILE; px++) {
            const n = hash2(tx * TILE + px, ty * TILE + py);
            let c: number;
            if (wall) c = py < 3 ? 0x6a6478 : py > 12 ? 0x2a2634 : n > 0.85 ? 0x4e4860 : 0x423c52;
            else c = px === 0 || py === 0 ? 0x24202c : n > 0.92 ? 0x3e3848 : n < 0.06 ? 0x2a2632 : 0x34303e;
            floor.rect(tx * TILE + px, ty * TILE + py, 1, 1, c);
          }
        }
      }
    }
    floor.present();
    floor.setDepth(-1e6);
    this.root.addChild(floor);

    // the dark, and torches along the north wall
    this.dark = new Darkness(stage, 0x05040c, 0.95);
    for (const tx of [3, 9, 15, 21]) {
      const x = tx * TILE + 8;
      const y = 2 * TILE - 4;
      const torch = addPixelLayer(stage);
      torch.rect(x - 1, y - 2, 2, 6, 0x5a3a24);
      torch.rect(x - 2, y - 5, 4, 3, 0xffb040);
      torch.rect(x - 1, y - 7, 2, 2, 0xfff0a0);
      torch.present();
      this.root.addChild(torch);
      this.dark.addLamp(x, y, 56, 0.12, 0xffa850);
    }

    this.evaporation = new Evaporation(stage, (o) => this.root.addChild(o));

    // the hero: a small knight in a few rects
    const layer = addPixelLayer(stage);
    this.root.addChild(layer);
    this.hero = { mover: createMover(4 * TILE, 8 * TILE), layer };

    for (let i = 0; i < 9; i++) this.spawnSlime(i);

    this.world.addSystem(
      system('move', 'fixed', () => {
        const input = this.input;
        input.poll();
        const [x, y] = input.vector('left', 'right', 'up', 'down');
        stepMover(this.hero.mover, [x, y, input.pressed('roll') ? INPUT_FLAG_DASH : 0], params, this.grid);
        if (input.pressed('strike')) this.strike();
        input.endStep();
      }),
    );
  }

  override update(): void {
    const now = performance.now();
    const m = this.hero.mover;
    this.drawHero(now);
    for (const s of this.slimes) this.drawSlime(s, now);
    this.drawSwings(now);
    this.evaporation.update(now);
    this.engine.stage.cameras.main.centerOn(m.x, m.y);
    this.dark.update(now, m.x, m.y - 6, 44);
    this.status.textContent = `slimes felled: ${this.felled} · WASD to walk, Shift to roll, Space/J to strike`;
  }

  override onExit(): void {
    this.keyboard.destroy();
    this.dark.destroy();
  }

  private drawHero(now: number): void {
    const { mover: m, layer: g } = this.hero;
    const bob = Math.floor(now / 250) % 2;
    const flip = m.lastDx < 0 ? -1 : 1;
    g.clear();
    g.setPosition(Math.round(m.x), Math.round(m.y));
    g.setDepth(m.y);
    g.rect(-4, -1, 8, 2, 0x14101c); // shadow
    g.rect(-3, -6 + bob, 6, 5, 0x8a94a8); // mail
    g.rect(-3, -6 + bob, 6, 1, 0xc0c8d8);
    g.rect(-3, -11 + bob, 6, 5, 0xb8c0d0); // helm
    g.rect(flip > 0 ? 0 : -3, -9 + bob, 3, 1, 0x101018); // visor
    g.rect(flip > 0 ? 3 : -5, -7 + bob, 2, 1, 0xe0e4f0); // sword hand
    g.rect(-3, -1, 2, 1, 0x3a3048);
    g.rect(1, -1, 2, 1, 0x3a3048);
    g.present();
  }

  private drawSwings(now: number): void {
    const m = this.hero.mover;
    for (let i = this.swings.length - 1; i >= 0; i--) {
      const w = this.swings[i]!;
      const t = (now - w.born) / 160;
      if (t >= 1) {
        w.layer.destroy();
        this.swings.splice(i, 1);
        continue;
      }
      // a crescent sweeping from over the head to the front, on the 1-px grid
      const g = w.layer;
      g.clear();
      g.setPosition(Math.round(m.x), Math.round(m.y) - 6);
      g.setDepth(m.y + 1);
      const a0 = w.dir > 0 ? -1.9 : Math.PI + 1.9 - 1.6;
      const sweep = 0.6 + t * 1.6;
      pixelPaint.arc(g, 0, 0, 11, w.dir > 0 ? a0 : a0 + 1.6 - sweep, w.dir > 0 ? a0 + sweep : a0 + 1.6, 0xe0e8ff, true, 2);
      g.present();
    }
  }

  private drawSlime(s: Slime, now: number): void {
    const squash = Math.round(Math.sin(now / 300 + s.phase));
    s.layer.clear();
    s.layer.setPosition(Math.round(s.x), Math.round(s.y));
    s.layer.setDepth(s.y);
    for (const p of s.pixels) s.layer.rect(p.dx, p.dy < -4 ? p.dy + squash : p.dy, 1, 1, p.color);
    s.layer.present();
  }

  private spawnSlime(i: number): void {
    let x = 0;
    let y = 0;
    do {
      x = (2 + Math.floor(Math.random() * (W - 4))) * TILE + 8;
      y = (3 + Math.floor(Math.random() * (H - 5))) * TILE + 12;
    } while (this.grid.solid[Math.floor(y / TILE) * W + Math.floor(x / TILE)] === 1);
    const layer = addPixelLayer(this.engine.stage);
    this.root.addChild(layer);
    this.slimes.push({ x, y, layer, pixels: slimePixels(i), phase: Math.random() * 6 });
  }

  /** Strikes the nearest slime in reach: it evaporates into its pixels, with a flash in the dark. */
  private strike(): void {
    const m = this.hero.mover;
    const swing = addPixelLayer(this.engine.stage);
    this.root.addChild(swing);
    this.swings.push({ layer: swing, born: performance.now(), dir: m.lastDx < 0 ? -1 : 1 });
    let best = -1;
    let bestD = 22;
    this.slimes.forEach((s, i) => {
      const d = Math.hypot(s.x - m.x, s.y - m.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) return;
    const [s] = this.slimes.splice(best, 1);
    const n = s!.pixels.length;
    const packed = new PackedPixels(Float32Array.from(s!.pixels, (p) => p.dx), Float32Array.from(s!.pixels, (p) => p.dy), Uint32Array.from(s!.pixels, (p) => p.color), n);
    const now = performance.now();
    this.evaporation.play({ x: s!.x, y: s!.y, scaleX: 1, scaleY: 1, pixels: packed }, false, now);
    flashLight(s!.x, s!.y - 5, 40, 260, 0xc8ff90, now);
    s!.layer.destroy();
    this.felled++;
    setTimeout(() => this.spawnSlime(this.felled), 2500);
  }
}

const engine = await Engine.create({ parent: document.getElementById('app')!, background: '#05040c', zoom: 3, pixelPerfect: true });
engine.events.on('error', ({ where, error }) => console.error(where, error));
(globalThis as { engine?: Engine }).engine = engine;
await engine.scenes.replace(new Dungeon());
