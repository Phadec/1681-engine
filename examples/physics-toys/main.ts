import { Graphics } from 'pixi.js';
import { Engine, Keyboard, PhysicsWorld, Scene, polygonCentroid, polygonShape, regularPolygon, type Body, type Shape } from '../../src';
import { BloomFilter, ChromaticAberrationFilter, CrtFilter, PixelateFilter, PostFx, VignetteFilter } from '../../src/postfx';

/*
 * Bodies that turn, and full-screen effects. Click to drop a shape (the next of box, ball, hexagon, triangle);
 * crates tumble down the ramp, balls roll, the bar in the middle spins and bats them away. Space blasts everything
 * outwards from the pointer with a shockwave and a flash. Number keys switch the effects: 1 bloom, 2 vignette,
 * 3 chromatic aberration, 4 CRT, 5 pixelate. R clears the toys.
 */

const W = 960;
const H = 540;
const COLORS = [0xffb347, 0x71d8ef, 0xc8a0ff, 0x8fe388, 0xff7a8a];
const KINDS = ['box', 'ball', 'hexagon', 'triangle'] as const;

function shapeOf(kind: (typeof KINDS)[number]): Shape {
  switch (kind) {
    case 'box':
      return { kind: 'box', halfWidth: 14, halfHeight: 14 };
    case 'ball':
      return { kind: 'circle', radius: 12 };
    case 'hexagon':
      return regularPolygon(6, 16);
    case 'triangle':
      return regularPolygon(3, 18);
  }
}

class Toys extends Scene {
  private readonly keys = new Keyboard();
  private readonly physics = new PhysicsWorld({ gravityY: 900, allowSleep: true, velocityIterations: 10 });
  private readonly draw = new Graphics();
  private readonly toys: { body: Body; color: number }[] = [];
  private post!: PostFx;
  private effects!: { key: string; name: string; filter: import('pixi.js').Filter }[];
  private spinner!: Body;
  private next = 0;
  private pointer = { x: W / 2, y: H / 3 };

  override onEnter(): void {
    const { stage } = this.engine;
    stage.cameras.main.centerOn(W / 2, H / 2);
    this.root.addChild(this.draw);

    // the room: floor, walls, a ramp falling to the right and a spinning bar
    const wall = (x: number, y: number, hw: number, hh: number) => this.physics.add({ type: 'static', shape: { kind: 'box', halfWidth: hw, halfHeight: hh }, x, y, friction: 0.7 });
    wall(W / 2, H - 10, W / 2, 10);
    wall(10, H / 2, 10, H / 2);
    wall(W - 10, H / 2, 10, H / 2);
    const ramp = [
      { x: 20, y: 200 },
      { x: 360, y: 330 },
      { x: 20, y: 330 },
    ];
    const c = polygonCentroid(ramp);
    this.physics.add({ type: 'static', shape: polygonShape(ramp), x: c.x, y: c.y, friction: 0.8 });
    this.spinner = this.physics.add({ type: 'kinematic', rotates: true, shape: { kind: 'box', halfWidth: 90, halfHeight: 6 }, x: 640, y: 330, angularVelocity: 1.6 });
    for (let i = 0; i < 12; i++) this.spawn(80 + (i % 4) * 40, 80 + Math.floor(i / 4) * 40);

    // effects over the whole picture: the first two on, the rest a key away
    this.post = PostFx.forEngine(this.engine);
    const bloom = this.post.add(new BloomFilter({ threshold: 0.6, intensity: 1.1, blur: 10 }));
    const vignette = this.post.add(new VignetteFilter({ strength: 0.55 }));
    const aberration = this.post.add(new ChromaticAberrationFilter(3));
    const crt = this.post.add(new CrtFilter());
    const pixelate = this.post.add(new PixelateFilter(4));
    for (const f of [aberration, crt, pixelate]) this.post.setEnabled(f, false);
    this.effects = [
      { key: 'Digit1', name: 'bloom', filter: bloom },
      { key: 'Digit2', name: 'vignette', filter: vignette },
      { key: 'Digit3', name: 'aberration', filter: aberration },
      { key: 'Digit4', name: 'crt', filter: crt },
      { key: 'Digit5', name: 'pixelate', filter: pixelate },
    ];

    const canvas = this.engine.app.canvas;
    const toWorld = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    const onDown = (e: PointerEvent) => {
      const p = toWorld(e);
      this.spawn(p.x, p.y);
    };
    const onMove = (e: PointerEvent) => (this.pointer = toWorld(e));
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    this.cleanup = () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
    };
    this.showHud();
  }

  private cleanup = (): void => {};

  private spawn(x: number, y: number): void {
    const kind = KINDS[this.next++ % KINDS.length]!;
    const body = this.physics.add({ shape: shapeOf(kind), x, y, rotates: true, angle: Math.random() * Math.PI, friction: 0.5, restitution: kind === 'ball' ? 0.4 : 0.1 });
    this.toys.push({ body, color: COLORS[this.toys.length % COLORS.length]! });
  }

  override fixedUpdate(dt: number): void {
    const k = this.keys;
    for (const e of this.effects) {
      if (!k.pressed(e.key)) continue;
      this.post.setEnabled(e.filter, !this.post.isEnabled(e.filter));
      this.showHud();
    }
    if (k.pressed('Space')) this.blast();
    if (k.pressed('KeyR')) {
      for (const t of this.toys) this.physics.remove(t.body);
      this.toys.length = 0;
    }
    k.endStep();
    this.physics.step(dt);
    // anything flung out of the room comes back from the top
    for (const t of this.toys) if (t.body.y > H + 100 || t.body.x < -100 || t.body.x > W + 100) t.body.setPosition(W / 2, 40);
  }

  private blast(): void {
    const { x, y } = this.pointer;
    for (const t of this.toys) {
      const dx = t.body.x - x;
      const dy = t.body.y - y;
      const d = Math.max(20, Math.hypot(dx, dy));
      if (d > 260) continue;
      const k = (1 - d / 260) * 700 * t.body.mass;
      // off the centre a little, so each one tumbles as it flies
      t.body.applyImpulse((dx / d) * k, (dy / d) * k, t.body.x + (Math.random() - 0.5) * 8, t.body.y + (Math.random() - 0.5) * 8);
    }
    this.post.shockwave(x, y, { amplitude: 18, ms: 700 });
    this.post.flash({ color: 0xfff4d6, strength: 0.35, ms: 140 });
  }

  override update(_dt: number, alpha: number): void {
    const g = this.draw.clear();
    g.rect(0, 0, W, H).fill(0x1a1626);
    for (const b of this.physics.bodies) {
      if (b.type === 'dynamic') continue;
      this.shape(g, b, alpha, b === this.spinner ? 0xfff4d6 : 0x3a3352);
    }
    for (const t of this.toys) this.shape(g, t.body, alpha, t.body.awake ? t.color : darker(t.color));
  }

  /** One body, drawn between its last two steps. */
  private shape(g: Graphics, b: Body, alpha: number, color: number): void {
    const x = b.prevX + (b.x - b.prevX) * alpha;
    const y = b.prevY + (b.y - b.prevY) * alpha;
    const a = b.prevAngle + (b.angle - b.prevAngle) * alpha;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const at = (lx: number, ly: number) => ({ x: x + c * lx - s * ly, y: y + s * lx + c * ly });
    const sh = b.shape;
    if (sh.kind === 'circle') {
      g.circle(x, y, sh.radius).fill(color);
      const p = at(sh.radius * 0.7, 0);
      g.moveTo(x, y).lineTo(p.x, p.y).stroke({ width: 2, color: 0x1a1626 });
      return;
    }
    const pts = sh.kind === 'box' ? [at(-sh.halfWidth, -sh.halfHeight), at(sh.halfWidth, -sh.halfHeight), at(sh.halfWidth, sh.halfHeight), at(-sh.halfWidth, sh.halfHeight)] : sh.vertices.map((v) => at(v.x, v.y));
    g.poly(pts.flatMap((p) => [p.x, p.y])).fill(color);
  }

  private showHud(): void {
    const hud = document.getElementById('hud');
    if (!hud) return;
    const fx = this.effects.map((e, i) => `${i + 1} ${e.name} ${this.post.isEnabled(e.filter) ? 'on' : 'off'}`).join(' · ');
    hud.textContent = `Click: drop a shape · Space: blast at the pointer · R: clear — ${fx}`;
  }

  override onExit(): void {
    this.cleanup();
    this.keys.destroy();
    this.post.destroy();
  }
}

function darker(c: number): number {
  return (((c >> 16) & 0xff) * 0.6) << 16 | ((((c >> 8) & 0xff) * 0.6) << 8) | ((c & 0xff) * 0.6);
}

const engine = await Engine.create({ parent: document.getElementById('app')!, width: W, height: H, background: '#0b0910' });
engine.events.on('error', ({ where, error }) => console.error(where, error));
(globalThis as { engine?: Engine }).engine = engine;
await engine.scenes.replace(new Toys());
