# Getting started

This walks through a complete little game: a character that walks a walled room and rolls. The finished file is
[`examples/walk-room/main.ts`](../examples/walk-room/main.ts).

## 1. An engine

```ts
import { Engine } from 'dither-engine';

const engine = await Engine.create({
  parent: document.getElementById('app')!,
  width: 960,
  height: 576,
  background: '#14101c',
  zoom: 3, // each world pixel is 3×3 screen pixels
});
```

Leave out `width` and `height` to fill `parent` and follow its size. Whole-number zooms keep pixel art crisp.

## 2. A scene

A scene is one screen of the game. It owns a `world` (entities and systems), a `root` container for what it draws in
the world and a `hud` container for what it draws on the screen. Everything in them is cleared when it leaves.

```ts
import { Scene } from 'dither-engine';

class RoomScene extends Scene {
  override onEnter() {
    // build the level here; may be async (load assets) — the scene updates once it resolves
  }
  override fixedUpdate(dt: number) {
    // once per simulation step (60 a second by default)
  }
  override update(dt: number, alpha: number) {
    // once per rendered frame; alpha is how far the frame is between two steps
  }
}

await engine.scenes.replace(new RoomScene());
```

`engine.scenes.push(menu)` pauses the current scene under another; `engine.scenes.pop()` resumes it.

## 3. Components and entities

Components are plain data with a typed key:

```ts
import { defineComponent, createMover, type MoverState, type MovementParams } from 'dither-engine';

const Body = defineComponent<{ mover: MoverState; params: MovementParams }>('Body');

// inside onEnter:
this.world.spawn([Body, { mover: createMover(64, 64), params: { speed: 70, dashSpeed: 200, dashSteps: 10, dashCooldownSteps: 40, canMove: true, canDash: true } }]);
```

## 4. Systems

A system is behaviour over the entities that hold some components, in one of two phases:

- **`fixed`**: once per simulation step, for movement and rules. Steps are equal in length on every machine.
- **`frame`**: once per rendered frame, for drawing.

```ts
import { system, stepMover, Keyboard, INPUT_FLAG_DASH } from 'dither-engine';

const keys = new Keyboard();

this.world.addSystem(
  system('move', 'fixed', ({ world }) => {
    const step: [number, number, number] = [
      keys.axis(['KeyA'], ['KeyD']),
      keys.axis(['KeyW'], ['KeyS']),
      keys.isDown('Space') ? INPUT_FLAG_DASH : 0,
    ];
    for (const [, body] of world.query(Body)) stepMover(body.mover, step, body.params, grid);
    keys.endStep();
  }),
);
```

Systems run in the order they were added. One that throws is reported on `engine.events` (`'error'`) and the others
still run.

## 4b. Fast components for many bodies

Object components are easy; for data thousands of bodies carry every step, keep it in typed-array columns and walk
the cached slot list. This is the fastest path in the engine (0.1 ms a step for 50,000 bodies, see `npm run bench`).

```ts
import { defineFields, system } from 'dither-engine';

const Position = defineFields('Position', { x: 'f32', y: 'f32' });
const Velocity = defineFields('Velocity', { x: 'f32', y: 'f32' });

this.world.spawn([Position, { x: 10, y: 20 }], [Velocity, { x: 30 }]);

this.world.addSystem(
  system('move', 'fixed', ({ world, dt }) => {
    const p = world.columns(Position); // fetch per run: columns grow as entities are added
    const v = world.columns(Velocity);
    const slots = world.slots(Position, Velocity); // cached until an entity joins or leaves
    for (let k = 0; k < slots.length; k++) {
      const i = slots[k]!;
      p.x[i]! += v.x[i]! * dt;
      p.y[i]! += v.y[i]! * dt;
    }
  }),
);
```

Which walk to use:

| Walk | Cost | Use for |
|---|---|---|
| `for (const [e, a, b] of world.query(A, B))` | a row per entity | anything not hot; the most readable |
| `world.each(A, B, (e, a, b) => …)` | no allocation | object components walked every step |
| `world.slots(A, B)` + `world.columns(A)` | a flat loop over typed arrays | numeric data on thousands of bodies |

## 5. Drawing pixels

`stage.add.pixels()` gives a `PixelLayer`: paint rects or `pixelPaint` shapes into it, then `present()`.

```ts
import { pixelPaint } from 'dither-engine';

const halo = this.engine.stage.add.pixels();
this.root.addChild(halo);

this.world.addSystem(
  system('halo', 'frame', ({ now }) => {
    const frame = Math.floor(now / (1000 / 12)); // effects step at 12 fps, like the art
    halo.clear();
    pixelPaint.ring(halo, 10 + (frame % 6), 0x71d8ef, frame, 2);
    halo.present();
  }),
);
```

## 6. Collision

Movement runs against a `CollisionGrid` of solid tiles:

```ts
import { createCollisionGrid } from 'dither-engine';

const grid = createCollisionGrid(width, height, 16, solidString, {
  bodyHalfWidth: 5, // the moving body's foot box
  bodyHalfHeight: 3,
});
```

The same `stepMover` on the same steps gives the same position on every machine, so a server can run it as the
authority and a client can predict with it.

## Next

- [Architecture](architecture.md) for how the pieces fit together.
- The source of `src/index.ts`: everything exported there is public API.
