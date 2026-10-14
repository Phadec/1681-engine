# Entities, components and systems

`World` is the engine's entity–component–system store. An entity is a number; a component is data under a typed key;
a system is a function the engine runs over the world every simulation step (`fixed`) or every rendered frame
(`frame`). Each component type is kept in its own sparse set, so finding one is two array reads and walking one is a
walk over packed arrays. Numeric data every body has can live in typed-array columns instead of objects
(`defineFields`), which is the fastest form there is. Every `Scene` owns a `world`; the engine runs its systems for
you. [Getting started](getting-started.md#_5-entities-components-and-systems) introduces it; this page goes deeper.

## Components

```ts
import { defineComponent, defineFields } from '1681-engine';

// object components: any value, kept by reference
const Health = defineComponent<{ hp: number; max: number }>('Health');
const Player = defineComponent<true>('Player'); // a tag

// field components: numbers in one typed array per field, indexed by the entity's slot
const Position = defineFields('Position', { x: 'f32', y: 'f32' });
const Velocity = defineFields('Velocity', { x: 'f32', y: 'f32' });
```

Define component types once, at module level: each call makes a new type with a new id, whatever its name.

A field's kind is one of `'f32' | 'f64' | 'i8' | 'i16' | 'i32' | 'u8' | 'u16' | 'u32'`, the typed array it is stored
in. A field component's **value**, wherever the world hands one back (`get`, `require`, `each`, `query`), is the
entity's slot index: the index into every one of its columns.

## Entities

```ts
const world = this.world; // a scene's own, or `new World()` anywhere (it needs no engine)

const e = world.spawn([Health, { hp: 10, max: 10 }], [Player, true]);
world.add(e, Position, { x: 32, y: 48 }); // fields left out start at 0; returns the slot index
world.add(e, Velocity);

world.has(e, Player); // true
world.get(e, Health); // { hp: 10, max: 10 }, or undefined
world.require(e, Health); // the same, or throws "entity … has no Health"
world.remove(e, Velocity);
world.destroy(e); // every component goes with it
world.isAlive(e); // false
```

`create()` makes an entity with no components; `add` on an entity that already holds the component replaces its
value. `count(Type)` is how many entities hold a component and `size` how many are alive. `entities()` and
`componentsOf(e)` list everything, for tools: both allocate.

### Ids and generations

An id carries its slot in the low 22 bits (`entityIndex(e)`) and a generation above them. Destroying an entity frees
its slot and bumps the generation, so the next entity in that slot gets a different id. An id kept after its entity
died is simply dead: `isAlive`, `has` and `get` answer false or undefined for it, and `destroy` on it does nothing,
even after the slot is reused. `entityIndex(e)` is the index into a field component's columns.

## Walking the world

| Walk | Cost | Use for |
|---|---|---|
| `for (const [e, a, b] of world.query(A, B))` | a row per entity | anything not hot; the most readable |
| `world.each(A, B, (e, a, b) => …)` | no allocation per entity | object components walked every step |
| `world.slots(A, B)` + `world.columns(A)` | a flat loop over typed arrays | numeric data on thousands of bodies |

`first(A, B)` returns the first matching row or undefined, for singletons (the player, the camera target). Every walk
starts from the smallest of the sets asked for, so `each(Rare, Common, …)` costs what `Rare` costs.

```ts
world.each(Health, Player, (e, health) => {
  if (health.hp <= 0) world.destroy(e); // deferred until the walk ends
});

const p = world.columns(Position); // { x: Float32Array, y: Float32Array }
const v = world.columns(Velocity);
const slots = world.slots(Position, Velocity); // Int32Array of slot indices
for (let k = 0; k < slots.length; k++) {
  const i = slots[k]!;
  p.x[i]! += v.x[i]!;
}
```

`slots` is cached per set of components and rebuilt only when an entity joins or leaves one of them, so asking for it
every step is cheap.

## Systems

```ts
import { system, type System } from '1681-engine';

world.addSystem(system('regen', 'fixed', ({ world, dt }) => {
  world.each(Health, (_e, h) => (h.hp = Math.min(h.max, h.hp + 2 * dt)));
}));

// or an object, when the system holds something to free
const drawer: System = { name: 'draw', phase: 'frame', run(ctx) { /* … */ }, dispose() { /* free textures */ } };
world.addSystem(drawer);
world.removeSystem('draw'); // calls dispose
```

A system's phase (`SystemPhase`) is:

- **`'fixed'`**: once per simulation step. `dt` is one step (1/60 s by default, `EngineOptions.hz`), `alpha` is 0.
  Movement, collision and game rules go here, so every machine takes the same steps whatever its frame rate.
- **`'frame'`**: once per rendered frame. `dt` is the frame's length, `alpha` the share of a step since the last fixed
  step (0–1), for drawing between the last two steps. Drawing and anything purely visual go here.

`ctx.now` is the frame's `performance.now()`. Systems of a phase run in the order they were added; a name may be added
only once.

### How the engine runs them

Each frame, `Engine` feeds the frame's length to its `FixedLoop`. For every step it owes, it runs
`world.run('fixed', …)` and then the scene's `fixedUpdate(dt)`; after the steps, `world.run('frame', …)` and then
`update(dt, alpha)`. A frame may run zero steps or several (at most 8 by default; the rest of a long stall is
dropped, so the game slows down rather than freezing). A system that throws is reported on `engine.events`
(`'error'`, where `system <name>`) and the systems after it still run. Calling `world.run` yourself without its
`onError` argument rethrows instead. See [Architecture](architecture.md#one-frame) for the whole frame.

When a scene leaves, its world is cleared: every entity gone, every system removed and disposed.

## A complete example

```ts
import { Graphics } from 'pixi.js';
import { Engine, Scene, defineComponent, defineFields, system } from '1681-engine';

const Position = defineFields('Position', { x: 'f32', y: 'f32' });
const Velocity = defineFields('Velocity', { x: 'f32', y: 'f32' });
const Dot = defineComponent<Graphics>('Dot');

const W = 320;
const H = 180;

class Field extends Scene {
  override onEnter(): void {
    // systems are added in onEnter: leaving clears them, so a scene entered again adds them again
    this.world.addSystem(
      system('move', 'fixed', ({ world, dt }) => {
        const p = world.columns(Position); // fetched per run: columns are replaced as they grow
        const v = world.columns(Velocity);
        const slots = world.slots(Position, Velocity);
        for (let k = 0; k < slots.length; k++) {
          const i = slots[k]!;
          p.x[i]! += v.x[i]! * dt;
          p.y[i]! += v.y[i]! * dt;
          if (p.x[i]! < 0 || p.x[i]! > W) v.x[i] = -v.x[i]!;
          if (p.y[i]! < 0 || p.y[i]! > H) v.y[i] = -v.y[i]!;
        }
      }),
    );
    this.world.addSystem(
      system('draw', 'frame', ({ world }) => {
        const p = world.columns(Position);
        world.each(Position, Dot, (_e, i, dot) => dot.position.set(p.x[i]!, p.y[i]!));
      }),
    );

    for (let n = 0; n < 200; n++) {
      const dot = new Graphics().circle(0, 0, 2).fill(0x9fe0ff);
      this.root.addChild(dot); // the scene destroys its root's children when it leaves
      const angle = Math.random() * Math.PI * 2;
      this.world.spawn(
        [Position, { x: Math.random() * W, y: Math.random() * H }],
        [Velocity, { x: Math.cos(angle) * 40, y: Math.sin(angle) * 40 }],
        [Dot, dot],
      );
    }
  }
}

const engine = await Engine.create({ parent: document.getElementById('app')!, width: W * 3, height: H * 3, zoom: 3 });
engine.stage.cameras.main.centerOn(W / 2, H / 2);
await engine.scenes.replace(new Field());
```

[`examples/ecs-stress`](/examples#ecs-stress) is the same idea at tens of thousands of bodies;
[`examples/walk-room`](/examples#walk-room) and [`examples/night-garden`](/examples#night-garden) use object
components with `each`.

## Performance

Measured numbers for `query`/`each`/`slots` at 10,000 to 200,000 bodies are in
[Architecture → ECS storage](architecture.md#ecs-storage) (`npm run bench`). In short: object components walked with
`each` move 10,000 bodies in about a tenth of a millisecond, field components through `slots` several times faster.
In [`examples/ecs-stress`](/examples#ecs-stress) the frame rate goes on drawing long before the ECS shows up.

## Inspecting a world

`inspectWorld(world, components?, limit = 20, previewLength = 40)` lists entities with a short preview of each
component: those holding any of `components` when you name some, otherwise every live entity and all it holds. A field
component shows only its name, since its numbers live in the columns. The [`DebugOverlay`](diagnostics-and-debug.md)
uses it; it allocates, so keep it out of per-frame code.

## Pitfalls

- **Fetch columns per run.** `columns(Type)` returns the current arrays; adding entities past their length replaces
  them with bigger ones, and arrays kept from an earlier run go stale silently.
- **Don't keep `slots()` past its step.** It is a view the world owns and reuses: calling `slots(...)` again for the
  same components after a change may overwrite the very buffer you are looping over. Fetch it once, loop, let it go.
- **Removal is deferred inside a walk.** While a `query`, an `each` or any system run is in progress, `destroy` and
  `remove` wait until the walk ends, so nothing is skipped or visited twice. Until then the entity still answers
  `isAlive` and `has` as before. Entities and components added mid-walk are not visited by that walk.
- **`slots` is not a walk.** A loop over `slots(...)` outside a system run does not defer anything: destroying there
  happens at once (the slot array you hold is unaffected, but its columns are now a dead entity's).
- **`spawn` does not type-check values.** Its tuples are `[ComponentType<unknown>, unknown]`; a wrong shape compiles.
  Use `add(e, Type, value)` when you want the compiler to check the value.
- **An entity id can need more than 32 bits.** Ids are slot plus generation × 2²², which passes 2³¹ after a few
  hundred reuses of a slot. Storing one in an `i32` or `u32` field truncates it; use `'f64'`, or an object component.
- **Walk order is not creation order.** Walks go backwards over packed arrays and removal swaps the last entry into
  the hole. Sort yourself if order matters (draw order, for instance, is `zIndex`'s job).
- **Systems added in a scene's constructor run once.** Leaving the scene clears its world, systems included, so a scene
  entered again has none. Add them in `onEnter`.
- **A reused slot starts its fields at zero.** `add` writes every field (0 for those left out), so a new entity never
  sees the last owner's numbers; but a destroyed entity's numbers stay in the columns until then, and nothing about a
  slot index tells you it is still alive.

## API

[`World`](/api/index/classes/World) · [`defineComponent`](/api/index/functions/defineComponent) ·
[`defineFields`](/api/index/functions/defineFields) · [`system`](/api/index/functions/system) ·
[`entityIndex`](/api/index/functions/entityIndex) · [`SystemContext`](/api/index/interfaces/SystemContext) ·
[`FixedLoop`](/api/index/classes/FixedLoop) · [`inspectWorld`](/api/index/functions/inspectWorld)
