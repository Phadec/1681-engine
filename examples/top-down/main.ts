import {
  Actions,
  AnimationComponent,
  Animator,
  AssetLoader,
  Engine,
  INPUT_FLAG_DASH,
  Keyboard,
  Scene,
  SpriteComponent,
  TilemapView,
  animationSystem,
  collisionFromTiled,
  createMover,
  defineComponent,
  isTouchUi,
  objectsOf,
  stepMover,
  system,
  type CollisionGrid,
  type MoverState,
  type MovementParams,
} from '../../src';

/*
 * A top-down walk through a map made in Tiled: assets loaded with progress, a tilemap drawn in chunks, collision read
 * from the tiles' `solid` property, an animated hero, named input actions (keyboard, gamepad, touch) and a camera that
 * follows softly. The assets are written by `make-assets.mjs`; open `assets/map.tmj` in Tiled to change the map.
 */

const Body = defineComponent<{ mover: MoverState; params: MovementParams }>('Body');

const CLIPS = {
  idle: { frames: [0, 1], fps: 2 },
  walk: { frames: [2, 3, 4, 5], fps: 10 },
};

type Action = 'left' | 'right' | 'up' | 'down' | 'roll';

class TopDownScene extends Scene {
  private readonly keyboard = new Keyboard();
  readonly input = new Actions<Action>(this.keyboard, {
    left: ['KeyA', 'ArrowLeft', 'pad:left', 'pad:lx-', 'touch:left'],
    right: ['KeyD', 'ArrowRight', 'pad:right', 'pad:lx+', 'touch:right'],
    up: ['KeyW', 'ArrowUp', 'pad:up', 'pad:ly-', 'touch:up'],
    down: ['KeyS', 'ArrowDown', 'pad:down', 'pad:ly+', 'touch:down'],
    roll: ['Space', 'pad:a', 'touch:roll'],
  });
  private map!: TilemapView;
  private grid!: CollisionGrid;

  override async onEnter(): Promise<void> {
    const { stage } = this.engine;
    const status = document.getElementById('status');

    // 1. assets, with progress
    const assets = new AssetLoader(stage.textures);
    assets.tilemap('map', 'assets/map.tmj').spritesheet('hero', 'assets/hero.png', { frameWidth: 16, frameHeight: 16 });
    await assets.load(({ done, total }) => status && (status.textContent = `loading ${done}/${total}`));
    const tiled = assets.map('map');

    // 2. the map, its collision and the camera's bounds
    this.map = new TilemapView(stage, tiled, { parent: this.root });
    this.grid = collisionFromTiled(tiled, { solid: { property: 'solid' }, bodyHalfWidth: 4, bodyHalfHeight: 3 });
    stage.cameras.main.setBounds(0, 0, this.map.widthPx, this.map.heightPx);

    // 3. the hero, at the map's spawn marker
    const start = objectsOf(tiled, 'spawn')[0] ?? { x: 32, y: 32 };
    const sprite = stage.add.image(start.x, start.y, 'hero', 0).setOrigin(0.5, 1);
    this.root.addChild(sprite);
    this.world.spawn(
      [Body, { mover: createMover(start.x, start.y), params: { speed: 72, dashSpeed: 210, dashSteps: 10, dashCooldownSteps: 36, canMove: true, canDash: true } }],
      [SpriteComponent, sprite],
      [AnimationComponent, new Animator(CLIPS, 'idle')],
    );
    stage.cameras.main.track(sprite, { lerp: 0.15, deadzoneWidth: 24, deadzoneHeight: 16, offsetY: -8 });

    // 4. systems: input and movement each step, then the look each frame
    this.world.addSystem(
      system('move', 'fixed', ({ world }) => {
        const input = this.input;
        input.poll();
        const [x, y] = input.vector('left', 'right', 'up', 'down');
        world.each(Body, (_e, body) => stepMover(body.mover, [x, y, input.pressed('roll') ? INPUT_FLAG_DASH : 0], body.params, this.grid));
        input.endStep();
      }),
    );
    this.world.addSystem(
      system('look', 'frame', ({ world }) => {
        world.each(Body, SpriteComponent, AnimationComponent, (_e, body, sprite, anim) => {
          const m = body.mover;
          const moving = this.input.down('left') || this.input.down('right') || this.input.down('up') || this.input.down('down') || m.dashLeft > 0;
          anim.play(moving ? 'walk' : 'idle');
          anim.speed = m.dashLeft > 0 ? 2 : 1;
          sprite.setPosition(Math.round(m.x), Math.round(m.y) + 3).setFlipX(m.lastDx < 0).setDepth(m.y);
        });
      }),
    );
    this.world.addSystem(animationSystem());

    status && (status.textContent = isTouchUi() ? 'drag the pad, tap roll' : 'WASD / arrows / gamepad to walk, Space to roll');
    if (isTouchUi()) touchPad(this.input);
  }

  override update(): void {
    this.map.update();
  }

  override onExit(): void {
    this.keyboard.destroy();
    this.map.destroy();
  }
}

/** Five on-screen buttons pressing the same actions the keys do. */
function touchPad(input: Actions<Action>): void {
  const pad = document.getElementById('pad');
  if (!pad) return;
  pad.hidden = false;
  for (const button of pad.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
    const name = button.dataset.action!;
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      input.press(name);
    });
    for (const end of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(end, () => input.release(name));
  }
}

const engine = await Engine.create({ pixelPerfect: true, parent: document.getElementById('app')!, background: '#1b2a1e', zoom: 3 });
engine.events.on('error', ({ where, error }) => console.error(where, error));
// handy in the browser console: engine.scene.world, engine.stage.cameras.main
(globalThis as { engine?: Engine }).engine = engine;
await engine.scenes.replace(new TopDownScene());
