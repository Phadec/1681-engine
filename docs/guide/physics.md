# Physics

`PhysicsWorld` is a small rigid-body world for platformers and physics toys: circles and axis-aligned boxes that
never rotate, stepped at the fixed simulation rate. It has gravity, restitution, friction, damping, sensors, collision
layers, kinematic movers, contact events, a `grounded` flag and raycasts. The whole of
[`examples/platformer`](/examples#platformer) runs on it.

::: warning Not for netcode
The solver's results depend on body order and floating point, so two machines can drift apart. That is fine for one
player's world, not for a world a server must replay: for that, move bodies with the deterministic `stepMover`
([Getting started](getting-started.md#_5-entities-components-and-systems)).
:::

## A world, a floor and a crate

```ts
import { PhysicsWorld, Scene, physicsSystem, syncToBody, type Body, type Image } from '1681-engine';

class Level extends Scene {
  private readonly physics = new PhysicsWorld({ gravityY: 980 }); // px/s², y grows downwards
  private crate!: Body;
  private view!: Image;

  override onEnter() {
    this.physics.add({ type: 'static', shape: { kind: 'box', halfWidth: 160, halfHeight: 8 }, x: 160, y: 200 });
    this.crate = this.physics.add({ shape: { kind: 'box', halfWidth: 7, halfHeight: 7 }, x: 160, y: 40, restitution: 0.2 });
    this.view = this.engine.stage.add.image(0, 0, 'crate');
    this.root.addChild(this.view);
    this.world.addSystem(physicsSystem(this.physics)); // a `fixed` system: one physics step per simulation step
  }

  override update(_dt: number, alpha: number) {
    syncToBody(this.view, this.crate, alpha, 0, 0, true); // between its last two step positions; whole pixels
  }
}
```

Positions are the shape's centre in world pixels; velocities are px per second. Body types:

| Type | Moves by | Use for |
|---|---|---|
| `dynamic` (default) | gravity, forces, contacts | the hero, crates, debris |
| `static` | never | ground and walls; cheapest, kept in a broad phase of its own |
| `kinematic` | its own velocity only | moving platforms: pushes dynamic bodies, is never pushed |

Order the fixed systems so input is read **before** the physics step and its results **after**, as the platformer
does: a `control` system that sets velocities, then `physicsSystem`, then an `aftermath` system for landings, falls and
pickups.

## Moving bodies

```ts
body.setVelocity(120, body.vy); // a controller setting its run speed
body.applyImpulse(0, -375 * body.mass); // a jump: velocity changes by impulse / mass
body.applyForce(40, 0); // wind, held for the next step only
body.setPosition(x, y); // a teleport: no interpolation across it
if (body.grounded) … // stood on something at the end of the last step; `body.ground` is what
```

A static body moved or resized by hand needs `physics.staticsChanged()` afterwards. A character controller usually
gives its body `friction: 0` and sets the run speed itself: a frictionless box never sticks to a wall it presses
against in the air. The platformer's `Hero.ts` adds coyote time, a jump buffer and a variable jump height on top, all
in a few constants rather than in the solver.

## Tiles into bodies

`tileBodies` covers the solid cells of a grid with as few static boxes as a greedy pass finds: a floor is one box and
a wall one tall box, so nothing snags on the seams between tiles. Faces that lie against more solid ground are marked
internal and never push a body out.

```ts
import { tileBodies, tileBodiesFromGrid, collisionFromTiled } from '1681-engine';

for (const b of tileBodies(LEVEL_W, LEVEL_H, 16, (tx, ty) => rows[ty]![tx] === '#', { friction: 0.8 })) this.physics.add(b);
// or from a Tiled map's collision
this.physics.addAll(tileBodiesFromGrid(collisionFromTiled(tiled)));
```

`mergeTileRects` is the merge on its own, for shapes of your own (the platformer lays its one-way planks with it).

## Layers and sensors

Each body has a `layer` (the bits it is in) and a `mask` (the bits it collides with); a pair collides when each one's
layer is in the other's mask. A `sensor` reports overlaps through contact events but pushes nothing and is never
pushed: coins, goals, trigger zones.

```ts
const LAYER = { world: 1, hero: 2, crate: 4, pickup: 8 } as const;

const coin = this.physics.add({
  type: 'static', sensor: true, shape: { kind: 'circle', radius: 5 }, x, y,
  layer: LAYER.pickup, mask: LAYER.hero, userData: 'coin', // only the hero is noticed
});

this.physics.events.on('begin', ({ a, b }) => {
  const other = a === hero.body ? b : b === hero.body ? a : null;
  if (other?.userData === 'coin') this.physics.remove(other); // safe here: events come after the step
});
```

`begin` and `end` are emitted after the step; `end` also fires when a body is removed. `contactsOf(body)` lists what
touches a body now. Remove listeners in `onExit` (`physics.events.clear()`).

## One-way platforms: `preSolve`

`preSolve` is called for each touching solid pair every sub-step; returning `false` skips its response this sub-step.

```ts
this.physics.preSolve = (c) => {
  const plank = c.a.userData === 'one-way' ? c.a : c.b.userData === 'one-way' ? c.b : null;
  if (!plank) return true;
  const other = c.other(plank);
  const halfH = other.shape.kind === 'box' ? other.shape.halfHeight : other.shape.radius;
  // only a body whose feet were on or above the plank when the step began
  return other.prevY + halfH <= plank.minY + 1 && other.vy >= -1;
};
```

## Raycasts

```ts
const hit = this.physics.raycast(x, y, x, y + 64, { mask: LAYER.world, filter: (b) => b !== hero.body });
if (hit) placeShadow(hit.x, hit.y); // also hit.body, hit.nx/ny, hit.fraction
```

Sensors are skipped unless `includeSensors`, and so are bodies the ray starts inside.

## Options that matter

| Option | Default | What |
|---|---|---|
| `gravityX`, `gravityY` | 0, 980 | px/s² |
| `cellSize` | 64 | broad-phase cell: about a typical body or a few tiles |
| `maxSubsteps` | 16 | a step is split so no body moves more than its smallest half size per sub-step |
| `maxSpeed` | 4000 | px/s; the bound that makes those sub-steps enough |
| `groundNormal` | 0.7 | a contact this much upward grounds a body (ground up to ~45°) |
| `allowSleep` | false | bodies at rest stop being simulated until something touches them |

Fast bodies are handled by sub-stepping, not swept tests, so a tiny body at a huge speed costs more sub-steps rather
than passing through.

## Seeing it

`drawColliders` draws every body's box coloured by kind for the [debug overlay](diagnostics-and-debug.md#debugoverlay):
static green, kinematic cyan, dynamic yellow on the ground and red in the air, sensors pink.

```ts
new DebugOverlay(engine, { key: 'F3', colliders: (draw) => drawColliders(physics, draw) });
```

`physics.bodies` lists every body for tools like this; read it, never hold it across a step.

## API

[`PhysicsWorld`](/api/index/classes/PhysicsWorld) · [`Body`](/api/index/classes/Body) ·
[`BodyOptions`](/api/index/interfaces/BodyOptions) · [`PhysicsWorldOptions`](/api/index/interfaces/PhysicsWorldOptions) ·
[`tileBodies`](/api/index/functions/tileBodies) · [`physicsSystem`](/api/index/functions/physicsSystem) ·
[`syncToBody`](/api/index/functions/syncToBody) · [`drawColliders`](/api/index/functions/drawColliders)
