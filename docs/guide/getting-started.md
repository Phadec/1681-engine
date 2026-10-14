# Getting started

This builds a small top-down game step by step: a map made in Tiled, an animated hero who walks and rolls, input from
keyboard, gamepad and touch, and a camera that follows. The finished file is
[`examples/top-down/main.ts`](/examples#top-down).

## 1. An engine

```ts
import { Engine } from '1681-engine';

const engine = await Engine.create({
  parent: document.getElementById('app')!, // fills it and follows its size; or pass width and height
  background: '#1b2a1e',
  zoom: 3, // each world pixel is 3×3 screen pixels
  pixelPerfect: true, // pixel art: sharp textures, a camera on whole pixels. Leave it out for smooth art.
});
engine.events.on('error', ({ where, error }) => console.error(where, error));
```

## 2. A scene

A scene is one screen of the game. It owns a `world` (entities and systems), a `root` container for what it draws in
the world and a `hud` container for what it draws on the screen; all of them are cleared when it leaves.

```ts
import { Scene } from '1681-engine';

class Level extends Scene {
  override async onEnter() {
    // load and build the level; the scene starts updating once this resolves
  }
  override fixedUpdate(dt: number) {
    // once per simulation step (60 a second by default), dt in seconds
  }
  override update(dt: number, alpha: number) {
    // once per rendered frame; alpha is how far the frame is between two steps
  }
}

await engine.scenes.replace(new Level());
```

`engine.scenes.push(pauseMenu)` pauses the current scene under another; `engine.scenes.pop()` resumes it.

## 3. Loading assets

```ts
import { AssetLoader } from '1681-engine';

// inside onEnter:
const assets = new AssetLoader(this.engine.stage.textures);
assets
  .tilemap('map', 'assets/map.tmj') // a Tiled map; its tileset images load with it
  .spritesheet('hero', 'assets/hero.png', { frameWidth: 16, frameHeight: 16 }); // frames named 0, 1, 2…
await assets.load(({ done, total }) => progressBar.set(done / total));
const tiled = assets.map('map');
```

A missing file fails the load with its URL in the message.

## 4. A Tiled map and its collision

Make the map in [Tiled](https://www.mapeditor.org) and save it as JSON (`.tmj`), with its tilesets embedded.

```ts
import { TilemapView, collisionFromTiled, objectsOf } from '1681-engine';

const map = new TilemapView(this.engine.stage, tiled, { parent: this.root });
const grid = collisionFromTiled(tiled, { solid: { property: 'solid' } }); // tiles with a `solid` property block
this.engine.stage.cameras.main.setBounds(0, 0, map.widthPx, map.heightPx);
const start = objectsOf(tiled, 'spawn')[0]; // a point object whose class is "spawn"
```

Call `map.update()` once a frame (in `update`): it shows only the chunks in view. Collision can also come from a tile
layer: by default, every tile of a layer named `collision` is solid.

## 5. Entities, components and systems

Components are plain data with a typed key; systems are behaviour over the entities that hold some of them, in one of
two phases: **`fixed`** once per simulation step (movement, rules), **`frame`** once per rendered frame (drawing).

```ts
import { defineComponent, system, createMover, stepMover, INPUT_FLAG_DASH, type MoverState, type MovementParams } from '1681-engine';

const Body = defineComponent<{ mover: MoverState; params: MovementParams }>('Body');

this.world.spawn([Body, { mover: createMover(start.x, start.y), params: { speed: 72, dashSpeed: 210, dashSteps: 10, dashCooldownSteps: 36, canMove: true, canDash: true } }]);

this.world.addSystem(
  system('move', 'fixed', ({ world }) => {
    world.each(Body, (_e, body) => stepMover(body.mover, [x, y, rolling ? INPUT_FLAG_DASH : 0], body.params, grid));
  }),
);
```

`stepMover` is deterministic: the same steps give the same position on every machine, so a server can run it as the
authority and a client can predict with it. Systems run in the order added; one that throws is reported on
`engine.events` and the others still run.

### Which walk to use

| Walk | Cost | Use for |
|---|---|---|
| `for (const [e, a, b] of world.query(A, B))` | a row per entity | anything not hot; the most readable |
| `world.each(A, B, (e, a, b) => …)` | no allocation | object components walked every step |
| `world.slots(A, B)` + `world.columns(A)` | a flat loop over typed arrays | numeric data on thousands of bodies |

```ts
import { defineFields } from '1681-engine';

const Position = defineFields('Position', { x: 'f32', y: 'f32' });
const Velocity = defineFields('Velocity', { x: 'f32', y: 'f32' });

system('drift', 'fixed', ({ world, dt }) => {
  const p = world.columns(Position); // fetch per run: columns grow as entities are added
  const v = world.columns(Velocity);
  const slots = world.slots(Position, Velocity); // cached until an entity joins or leaves
  for (let k = 0; k < slots.length; k++) {
    const i = slots[k]!;
    p.x[i]! += v.x[i]! * dt;
    p.y[i]! += v.y[i]! * dt;
  }
});
```

## 6. A sprite that animates

```ts
import { Animator, SpriteComponent, AnimationComponent, animationSystem } from '1681-engine';

const sprite = this.engine.stage.add.image(start.x, start.y, 'hero', 0).setOrigin(0.5, 1);
this.root.addChild(sprite);
const clips = { idle: { frames: [0, 1], fps: 2 }, walk: { frames: [2, 3, 4, 5], fps: 10 } };
this.world.spawn([Body, …], [SpriteComponent, sprite], [AnimationComponent, new Animator(clips, 'idle')]);
this.world.addSystem(animationSystem()); // advances every Animator and shows its frame
```

In your own frame system, `anim.play('walk')` switches clip (the clip already playing keeps its place), and
`sprite.setDepth(y)` sorts bodies by where they stand.

## 7. Input actions

Game code asks for actions, never for keys, so players can rebind and every device works the same.

```ts
import { Actions, Keyboard } from '1681-engine';

const input = new Actions(new Keyboard(), {
  left: ['KeyA', 'ArrowLeft', 'pad:left', 'pad:lx-', 'touch:left'],
  right: ['KeyD', 'ArrowRight', 'pad:right', 'pad:lx+', 'touch:right'],
  up: ['KeyW', 'ArrowUp', 'pad:up', 'pad:ly-', 'touch:up'],
  down: ['KeyS', 'ArrowDown', 'pad:down', 'pad:ly+', 'touch:down'],
  roll: ['Space', 'pad:a', 'touch:roll'],
});

// at the start of each fixed step:
input.poll();
const [x, y] = input.vector('left', 'right', 'up', 'down'); // never longer than 1
const rolling = input.pressed('roll');
input.endStep();
```

An on-screen button calls `input.press('roll')` on pointer down and `input.release('roll')` on pointer up.

## 8. The camera

```ts
this.engine.stage.cameras.main.track(sprite, { lerp: 0.15, deadzoneWidth: 24, deadzoneHeight: 16 });
```

`lerp` 1 locks on; lower follows softly, at the same pace at any frame rate. The camera stays inside its bounds.

## 9. Pixel art

Pixel-art tools live in their own module, so other games never ship them:

```ts
import { addPixelLayer, pixelPaint } from '1681-engine/pixel';

const halo = addPixelLayer(this.engine.stage); // thousands of pixel rects in one texture
this.root.addChild(halo);

system('halo', 'frame', ({ now }) => {
  const frame = Math.floor(now / (1000 / 12)); // effects step at 12 fps, like the art
  halo.clear();
  pixelPaint.ring(halo, 10 + (frame % 6), 0x71d8ef, frame, 2);
  halo.present();
});
```

It also holds `Darkness` (night and caves lit by dithered lamps), `Evaporation` (a body dissolving into its own
pixels) and the colour ramps. [`examples/walk-room`](/examples#walk-room) uses them.

## 10. Characters from a rig

A rig is a skeleton posed by bone angles; `RigView` draws it with cut-out images or vector shapes, and `PosePlayer`
blends between key poses so a few keys make a smooth motion. The built-in humanoid comes with 72 poses and clips.

```ts
import { RigView, PosePlayer, HUMANOID_RIG, HUMANOID_POSES, HUMANOID_CLIPS } from '1681-engine';

const hero = new RigView(HUMANOID_RIG, { torso: { color: 0x7a4ab0 } }, undefined, { scale: 3 }); // or { texture: 'arm' } per part
this.root.addChild(hero);
const poses = new PosePlayer(HUMANOID_POSES, HUMANOID_CLIPS, 'idle');

// each frame:
poses.play(moving ? 'walk' : 'idle', { fadeMs: 120 });
poses.update(dt);
hero.setPose(poses.pose);
hero.facing = goingLeft ? -1 : 1;
```

## 11. Light and music

```ts
import { LightLayer, music } from '1681-engine';

const night = new LightLayer(this.engine.stage, { darkness: 0.88 });
const lantern = night.add({ x: 0, y: 0, radius: 140, color: 0xffb060, flicker: 0.06 });
// each frame: lantern.x = hero.x; lantern.y = hero.y - 30; night.update();

music.play('music/night.ogg'); // starts on the first tap or key; crossfades when another track plays
music.channel('ambience').play('amb/crickets.ogg', { volume: 0.4 }); // a second layer under the score
```

Every channel follows `engineSettings.musicVolume`. Music goes through Web Audio only where an `<audio>`'s own volume
is read-only (iOS); `music.configure({ route: 'graph' })` forces it, and `pauseInBackground` stops it while the page
is hidden (on touch devices by default). Footsteps by surface are `new Footsteps({ sounds, fallback })` with
`setSurfaceAt((x, y) => …)` and `step(x, y, local)` on each beat of a walk.

Pixel-art games use the pixel module's dithered `Darkness` instead. [`examples/night-garden`](/examples#night-garden)
puts the rig, the lights and smooth vector art together.

## 12. Multiplayer

The server is authoritative: clients send input steps, the server moves everyone with the same `stepMover` and sends
snapshots. Each client predicts its own body (no lag on its own keys) and draws everyone else a little in the past,
between snapshots. Because movement is deterministic, a prediction replayed on the server's word lands exactly where
it was: in practice the server never has to correct it.

**Server** (Node, any WebSocket library; `ws` here):

```ts
import { WebSocketServer } from 'ws';
import { Room, RoomHost } from '1681-engine';

const room = new Room({ grid: GRID, params: PARAMS, spawn: () => ({ x: 64, y: 64 }) });
const host = new RoomHost(room, { admit: (hello) => validate(hello) }); // throw to refuse a player
new WebSocketServer({ port: 5181 }).on('connection', (ws) => {
  const id = host.connect(ws);
  ws.on('message', (data, binary) => host.message(id, binary ? new Uint8Array(data) : data.toString()));
  ws.on('close', () => host.disconnect(id));
});
host.start(); // 60 steps and 20 snapshots a second
```

**Client:**

```ts
import { Connection, PredictedMover, InterpolationBuffer, serverNow } from '1681-engine';

const conn = new Connection('ws://localhost:5181', { hello: () => ({ name: 'Ash' }) }).connect();
const others = new InterpolationBuffer(100);
let me: PredictedMover | null = null;
conn.events.on('snapshot', (s) => {
  me ??= new PredictedMover(s.me![0], s.me![1], PARAMS, GRID);
  me.reconcile(s.ack, s.me!); // rewind to the server's word, replay what it has not seen yet
  others.push(s.time, s.up!); // s.sp: bodies that came into view; s.rm: bodies that left
});

// each fixed step: conn.queueInput(me.step(step), step);
// each frame: conn.flush(); me.smooth(dt); draw me at (me.drawX, me.drawY), others at others.sample(id, serverNow())
```

Share the map and `MovementParams` between server and client (one module both import), or predictions will disagree.
`Room` refuses input no client sends (NaN, axes past 1, floods), never runs more than a few steps a tick for one
player, and `RoomHost` disconnects whoever keeps sending nonsense. [`examples/multiplayer`](/examples#multiplayer)
is the whole thing: `npm run example:server`, then open it in two tabs.

## Next

- [Architecture](architecture.md) for how the pieces fit together.
- `src/index.ts` and `src/pixel/index.ts`: everything exported there is public API.
