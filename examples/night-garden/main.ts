import { Graphics } from 'pixi.js';
import {
  Actions,
  Engine,
  HUMANOID_CLIPS,
  HUMANOID_POSES,
  HUMANOID_RIG,
  INPUT_FLAG_DASH,
  Keyboard,
  LightLayer,
  PosePlayer,
  RigView,
  Scene,
  createCollisionGrid,
  createMover,
  defineComponent,
  stepMover,
  system,
  type CollisionGrid,
  type Light,
  type MoverState,
  type MovementParams,
} from '../../src';

/*
 * The core with smooth art, no pixel module: a garden drawn as vector shapes at the screen's own density, a rigged
 * character animated by blended poses (walk, run with Shift, roll with Space), a lantern that follows it through the
 * dark, drifting fireflies, and a soft camera.
 */

const Hero = defineComponent<{ mover: MoverState; params: MovementParams; view: RigView; poses: PosePlayer<keyof typeof HUMANOID_CLIPS>; lantern: Light }>('Hero');
const Firefly = defineComponent<{ light: Light; home: { x: number; y: number }; phase: number }>('Firefly');

const TILE = 16;
const W = 60;
const H = 40;

type Action = 'left' | 'right' | 'up' | 'down' | 'run' | 'roll';

class NightGarden extends Scene {
  private readonly keyboard = new Keyboard();
  private readonly input = new Actions<Action>(this.keyboard, {
    left: ['KeyA', 'ArrowLeft', 'pad:left', 'pad:lx-'],
    right: ['KeyD', 'ArrowRight', 'pad:right', 'pad:lx+'],
    up: ['KeyW', 'ArrowUp', 'pad:up', 'pad:ly-'],
    down: ['KeyS', 'ArrowDown', 'pad:down', 'pad:ly+'],
    run: ['ShiftLeft', 'ShiftRight', 'pad:x'],
    roll: ['Space', 'pad:a'],
  });
  private night!: LightLayer;
  private grid!: CollisionGrid;

  override onEnter(): void {
    const { stage } = this.engine;

    // the garden: grass, a winding path, a pond and round trees; trees and pond are solid
    const solid = new Uint8Array(W * H);
    const ground = new Graphics();
    ground.rect(0, 0, W * TILE, H * TILE).fill(0x2f5a3a);
    for (let i = 0; i < 400; i++) {
      const x = (i * 97) % (W * TILE);
      const y = (i * 151) % (H * TILE);
      ground.ellipse(x, y, 10 + (i % 7), 4 + (i % 3)).fill({ color: i % 2 ? 0x356a42 : 0x2a5034, alpha: 0.8 });
    }
    ground.moveTo(0, 300);
    for (let x = 0; x <= W * TILE; x += 40) ground.lineTo(x, 300 + Math.sin(x / 90) * 60);
    ground.stroke({ color: 0x9c7a50, width: 34, cap: 'round', join: 'round' });
    ground.ellipse(700, 160, 90, 55).fill(0x23507a).stroke({ color: 0x184060, width: 4 });
    const markSolid = (cx: number, cy: number, rx: number, ry: number) => {
      for (let ty = 0; ty < H; ty++)
        for (let tx = 0; tx < W; tx++) if (((tx + 0.5) * TILE - cx) ** 2 / rx ** 2 + ((ty + 0.5) * TILE - cy) ** 2 / ry ** 2 < 1) solid[ty * W + tx] = 1;
    };
    markSolid(700, 160, 90, 55);
    this.root.addChild(ground);
    const trees = [[120, 120], [240, 520], [430, 140], [520, 470], [860, 420], [900, 120], [330, 380], [640, 560]];
    for (const [x, y] of trees) {
      const t = new Graphics();
      t.ellipse(0, 4, 26, 10).fill({ color: 0x000000, alpha: 0.3 });
      t.roundRect(-5, -26, 10, 30, 3).fill(0x5a3a24);
      t.circle(0, -44, 30).fill(0x1f4a2a).circle(-10, -52, 18).fill({ color: 0x2f6a3a, alpha: 0.9 });
      t.position.set(x!, y!);
      t.zIndex = y!;
      this.root.addChild(t);
      markSolid(x!, y!, 14, 10);
    }
    for (let x = 0; x < W; x++) solid[x] = solid[(H - 1) * W + x] = 1;
    for (let y = 0; y < H; y++) solid[y * W] = solid[y * W + W - 1] = 1;
    this.grid = createCollisionGrid(W, H, TILE, [...solid].join(''), { bodyHalfWidth: 6, bodyHalfHeight: 4 });
    stage.cameras.main.setBounds(0, 0, W * TILE, H * TILE);

    // the night and its lights
    this.night = new LightLayer(stage, { darkness: 0.88, squash: 0.85 });

    // the hero: a vector rig, three times the grid
    const view = new RigView(HUMANOID_RIG, { torso: { color: 0x7a4ab0 }, upperArmF: { color: 0x7a4ab0 }, upperArmB: { color: 0x7a4ab0 }, head: { color: 0xf0c8a0 } }, undefined, { scale: 3 });
    this.root.addChild(view);
    const lantern = this.night.add({ x: 0, y: 0, radius: 140, color: 0xffb060, flicker: 0.06 });
    this.world.spawn([
      Hero,
      {
        mover: createMover(200, 300),
        params: { speed: 90, dashSpeed: 260, dashSteps: 12, dashCooldownSteps: 40, canMove: true, canDash: true },
        view,
        poses: new PosePlayer(HUMANOID_POSES, HUMANOID_CLIPS, 'idle'),
        lantern,
      },
    ]);
    stage.cameras.main.track(view, { lerp: 0.08, offsetY: -30 });

    // fireflies: small coloured lights wandering round a home
    for (let i = 0; i < 24; i++) {
      const home = { x: 60 + ((i * 211) % (W * TILE - 120)), y: 60 + ((i * 137) % (H * TILE - 120)) };
      this.world.spawn([Firefly, { light: this.night.add({ ...home, radius: 22, color: 0xc8ff70, intensity: 0.8 }), home, phase: i * 1.7 }]);
    }

    this.world.addSystem(
      system('move', 'fixed', ({ world }) => {
        const input = this.input;
        input.poll();
        const [x, y] = input.vector('left', 'right', 'up', 'down');
        world.each(Hero, (_e, h) => {
          h.params.speed = input.down('run') ? 150 : 90;
          stepMover(h.mover, [x, y, input.pressed('roll') ? INPUT_FLAG_DASH : 0], h.params, this.grid);
        });
        input.endStep();
      }),
    );
    this.world.addSystem(
      system('hero-look', 'frame', ({ world, dt }) => {
        world.each(Hero, (_e, h) => {
          const m = h.mover;
          const moving = this.input.down('left') || this.input.down('right') || this.input.down('up') || this.input.down('down');
          const clip = m.dashLeft > 0 ? 'roll' : moving ? (this.input.down('run') ? 'run' : 'walk') : 'idle';
          h.poses.play(clip, { fadeMs: clip === 'roll' ? 0 : 120, restart: clip === 'roll' && h.poses.current !== 'roll' });
          h.poses.update(dt);
          h.view.setPose(h.poses.pose);
          h.view.position.set(m.x, m.y + 4);
          h.view.facing = m.lastDx < 0 ? -1 : 1;
          h.view.zIndex = m.y;
          h.lantern.x = m.x + (m.lastDx < 0 ? -14 : 14);
          h.lantern.y = m.y - 30;
        });
      }),
    );
    this.world.addSystem(
      system('fireflies', 'frame', ({ world, now }) => {
        world.each(Firefly, (_e, f) => {
          const t = now / 1000 + f.phase;
          f.light.x = f.home.x + Math.sin(t * 0.7) * 40 + Math.sin(t * 2.3) * 8;
          f.light.y = f.home.y + Math.cos(t * 0.5) * 30;
          f.light.intensity = 0.5 + 0.4 * Math.sin(t * 3);
        });
      }),
    );
  }

  override update(): void {
    this.night.update();
  }

  override onExit(): void {
    this.keyboard.destroy();
    this.night.destroy();
  }
}

const engine = await Engine.create({ parent: document.getElementById('app')!, background: '#0b1410', zoom: 1.5 });
engine.events.on('error', ({ where, error }) => console.error(where, error));
(globalThis as { engine?: Engine }).engine = engine;
await engine.scenes.replace(new NightGarden());
