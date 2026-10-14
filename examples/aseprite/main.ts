import { Engine, Keyboard, Scene, SpriteComponent, defineComponent, system, AnimStateMachine, AnimStateComponent, animStateSystem, sliceAt, sliceNamed, clipMarkers, parseAseprite, addAsepriteTextures } from '../../src';
import { FRAME, paintSheet, sheetJson } from './sheet';

/*
 * An Aseprite sheet read by `parseAseprite` (tags become clips, the "events" layer's cel data becomes frame markers,
 * a slice's pivot places the sprite), driven by an `AnimStateMachine`: idle, run, jump, fall and land, moved between
 * by parameters the movement sets each step. The footsteps and the landing's thud are markers drawn by the artist,
 * not timers in the code. Left / right (A / D) to run, Space or Up to jump.
 */

const GROUND = 120;
const Body = defineComponent<{ x: number; y: number; vx: number; vy: number; grounded: boolean }>('Body');

class AsepriteScene extends Scene {
  private readonly keys = new Keyboard();

  override onEnter(): void {
    const { stage } = this.engine;
    stage.cameras.main.centerOn(120, 80);

    // 1. the "export": parse the JSON, cut the sheet by its frames
    const sheet = parseAseprite(sheetJson());
    addAsepriteTextures(stage.textures, 'figure', paintSheet(), sheet);
    const markers = clipMarkers(sheet, 'events');

    // 2. the state machine over the sheet's clips
    const sm = new AnimStateMachine(sheet.clips, {
      initial: 'idle',
      params: { speed: 0, grounded: true, vy: 0, jump: 'trigger' },
      states: {
        idle: { clip: 'idle' },
        run: { clip: 'run', speedParam: 'speed', markers: markers.run },
        jump: { clip: 'jump', markers: [{ frame: 0, name: 'whoosh' }] },
        fall: { clip: 'fall' },
        land: { clip: 'land', markers: markers.land },
      },
      transitions: [
        // the movement only fires the trigger from the ground, and has already left it by the time this runs
        { from: '*', to: 'jump', when: { jump: true }, priority: 10 },
        { from: ['idle', 'land'], to: 'run', when: { speed: ['>', 0.1], grounded: true } },
        { from: 'run', to: 'idle', when: { speed: ['<=', 0.1] } },
        { from: ['idle', 'run'], to: 'fall', when: { grounded: false } },
        { from: 'jump', to: 'fall', when: { vy: ['>', 0] } },
        { from: ['jump', 'fall'], to: 'land', when: { grounded: true } },
        { from: 'land', to: 'idle', onEnd: true },
      ],
    });

    // 3. the hero, standing on the slice's pivot
    const pivot = sliceAt(sliceNamed(sheet, 'feet')!, 0)?.pivot ?? { x: FRAME / 2, y: FRAME };
    const sprite = stage.add.image(60, GROUND, 'figure', 0).setOrigin(pivot.x / FRAME, pivot.y / FRAME);
    this.root.addChild(sprite, stage.add.rectangle(120, GROUND + 4, 240, 8, 0x2a3a2e));
    const hero = this.world.spawn([Body, { x: 60, y: GROUND, vx: 0, vy: 0, grounded: true }], [SpriteComponent, sprite], [AnimStateComponent, sm]);

    // 4. what the markers are for: here a line on the page, in a game a sound or a puff of dust
    const log = document.getElementById('events');
    const lines: string[] = [];
    sm.onEvent = (event, state, frame) => {
      lines.unshift(`${event} (${state}, frame ${frame})`);
      lines.length = Math.min(lines.length, 8);
      if (log) log.textContent = lines.join('\n');
    };
    const status = document.getElementById('state');
    sm.onStateChange = (from, to) => status && (status.textContent = `${from} → ${to}`);

    // 5. movement each step sets the parameters; the machine and the sprite follow each frame
    this.world.addSystem(
      system('move', 'fixed', ({ world, dt }) => {
        const k = this.keys;
        const b = world.get(hero, Body)!;
        b.vx = 90 * k.axis(['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD']);
        if (b.grounded && (k.pressed('Space') || k.pressed('ArrowUp') || k.pressed('KeyW'))) {
          b.vy = -220;
          sm.trigger('jump');
        }
        b.vy += 600 * dt;
        b.x = Math.max(8, Math.min(232, b.x + b.vx * dt));
        b.y += b.vy * dt;
        b.grounded = b.y >= GROUND;
        if (b.grounded) {
          b.y = GROUND;
          b.vy = 0;
        }
        sm.set('speed', Math.abs(b.vx) / 90).set('grounded', b.grounded).set('vy', b.vy);
        k.endStep();
      }),
    );
    this.world.addSystem(
      system('place', 'frame', ({ world }) => {
        const b = world.get(hero, Body)!;
        sprite.setPosition(Math.round(b.x), Math.round(b.y));
        if (b.vx !== 0) sprite.setFlipX(b.vx < 0);
      }),
    );
    this.world.addSystem(animStateSystem());
  }

  override onExit(): void {
    this.keys.destroy();
  }
}

const engine = await Engine.create({ pixelPerfect: true, parent: document.getElementById('app')!, width: 960, height: 640, background: '#14101c', zoom: 4 });
engine.events.on('error', ({ where, error }) => console.error(where, error));
await engine.scenes.replace(new AsepriteScene());
