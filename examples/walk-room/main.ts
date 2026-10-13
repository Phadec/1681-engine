import {
  Engine,
  EventBus,
  INPUT_FLAG_DASH,
  Keyboard,
  Scene,
  TILE_SIZE,
  createCollisionGrid,
  createMover,
  defineComponent,
  stepMover,
  system,
  type CollisionGrid,
  type MoverState,
  type MovementParams,
} from '../../src';
import { addPixelLayer, pixelPaint, registerHandRamps, type PixelLayer } from '../../src/pixel';

// the hero's two colours shaded by hand rather than by the formula: a game picks ramps like these for its own colours
registerHandRamps([
  [0xc8a0ff, { hi: 0xfbf0ff, light: 0xe6cdfc, deep: 0x8456c8, shade: 0x3e2466 }],
  [0xffd98a, { hi: 0xfffbe6, light: 0xffecb8, deep: 0xc8963e, shade: 0x6a4424 }],
]);

/*
 * The smallest whole game: an engine, one scene, three components and three systems. A box walks a walled room
 * (arrows / WASD, Space rolls) with a pixel ring round it, and an event bus tells the HUD line when it rolls.
 */

// ── Components: plain data ────────────────────────────────────────────────────────────────────────────────────
const Body = defineComponent<{ mover: MoverState; params: MovementParams }>('Body');
const Sprite = defineComponent<{ layer: PixelLayer; color: number; rollColor: number }>('Sprite');
const Halo = defineComponent<{ layer: PixelLayer }>('Halo');

interface RoomEvents {
  rolled: { x: number; y: number };
}

const W = 20;
const H = 12;

class RoomScene extends Scene {
  private readonly keys = new Keyboard();
  readonly bus = new EventBus<RoomEvents>();
  private grid!: CollisionGrid;

  override onEnter(): void {
    const stage = this.engine.stage;

    // a room with a wall round it and a pillar in the middle
    let solid = '';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) solid += x === 0 || y === 0 || x === W - 1 || y === H - 1 || (x >= 9 && x <= 10 && y >= 5 && y <= 6) ? '1' : '0';
    }
    this.grid = createCollisionGrid(W, H, TILE_SIZE, solid);
    stage.cameras.main.centerOn((W * TILE_SIZE) / 2, (H * TILE_SIZE) / 2);

    // the room never changes: painted once
    const floor = addPixelLayer(stage);
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const wall = solid[ty * W + tx] === '1';
        floor.rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE, wall ? 0x4a3a52 : (tx + ty) % 2 ? 0x26352a : 0x2a3a2e);
      }
    }
    floor.present();
    this.root.addChild(floor);

    // the hero: one entity, three components
    const sprite = addPixelLayer(stage);
    const halo = addPixelLayer(stage);
    this.root.addChild(sprite, halo);
    this.world.spawn(
      [Body, { mover: createMover(4 * TILE_SIZE, 4 * TILE_SIZE), params: { speed: 70, dashSpeed: 200, dashSteps: 10, dashCooldownSteps: 40, canMove: true, canDash: true } }],
      [Sprite, { layer: sprite, color: 0xc8a0ff, rollColor: 0xffd98a }],
      [Halo, { layer: halo }],
    );

    // ── Systems: behaviour, in order ──────────────────────────────────────────────────────────────────────────
    this.world.addSystem(
      system('input-move', 'fixed', ({ world }) => {
        const k = this.keys;
        const step: [number, number, number] = [
          k.axis(['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD']),
          k.axis(['ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS']),
          k.isDown('Space') ? INPUT_FLAG_DASH : 0,
        ];
        for (const [, body] of world.query(Body)) {
          const wasRolling = body.mover.dashLeft > 0;
          stepMover(body.mover, step, body.params, this.grid);
          if (!wasRolling && body.mover.dashLeft > 0) this.bus.emit('rolled', { x: body.mover.x, y: body.mover.y });
        }
        k.endStep();
      }),
    );
    this.world.addSystem(
      system('draw-body', 'frame', ({ world }) => {
        for (const [, body, look] of world.query(Body, Sprite)) {
          const m = body.mover;
          look.layer.clear();
          look.layer.rect(Math.round(m.x) - 5, Math.round(m.y) - 10, 10, 13, m.dashLeft > 0 ? look.rollColor : look.color);
          look.layer.present();
        }
      }),
    );
    this.world.addSystem(
      system('draw-halo', 'frame', ({ world, now }) => {
        // effects are redrawn at 12 fps on the world's pixel grid
        const frame = Math.floor(now / (1000 / 12));
        for (const [, body, halo] of world.query(Body, Halo)) {
          const g = halo.layer;
          g.clear();
          g.setPosition(Math.round(body.mover.x), Math.round(body.mover.y));
          pixelPaint.ring(g, 10 + (frame % 6), 0x71d8ef, frame, 2);
          pixelPaint.arc(g, 0, -4, 16, frame * 0.4, frame * 0.4 + 1.6, 0xff7438, true, 2);
          pixelPaint.diamond(g, 0, -20, 3, 0xfff4d6);
          g.present();
        }
      }),
    );

    let rolls = 0;
    const hud = document.getElementById('hud');
    this.bus.on('rolled', (p) => {
      rolls++;
      if (hud) hud.textContent = `rolls: ${rolls} — last at ${Math.round(p.x)}, ${Math.round(p.y)}`;
    });
  }

  override onExit(): void {
    this.keys.destroy();
    this.bus.clear();
  }
}

const engine = await Engine.create({ pixelPerfect: true, parent: document.getElementById('app')!, width: 960, height: 576, background: '#14101c', zoom: 3 });
engine.events.on('error', ({ where, error }) => console.error(where, error));
await engine.scenes.replace(new RoomScene());
