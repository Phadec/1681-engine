# Particles

`Emitter` throws smooth sprite particles for any art style: dust, sparks, smoke, magic. Each emitter draws one texture
through one Pixi `ParticleContainer`, pools its particle objects, and asks a shared `ParticleBudget` before it spawns,
so ten explosions in one frame cost no more than the budget allows.

## Dust from the feet

```ts
import { Texture } from 'pixi.js';
import { Emitter } from '1681-engine';

const dust = new Emitter({
  texture: Texture.WHITE, // one white texel, sized and tinted per particle: no particle art needed
  rate: 22, // per second while emitting
  lifetime: [0.25, 0.45], // a range is rolled per particle
  speed: [12, 36],
  angle: -Math.PI / 2, // up the screen…
  spread: 1.3, // …give or take this many radians
  gravityY: 160,
  drag: 2,
  size: { start: 2, end: 1 },
  tint: { start: 0xd8b48a, end: 0x8d6038 },
  alpha: [[0, 0.9], [1, 0]],
});
this.root.addChild(dust.view); // world space, under the scene's root

// each frame
dust.setPosition(hero.x, hero.y);
if (running && !dust.emitting) dust.start();
else if (!running && dust.emitting) dust.stop(); // particles in the air live out their lives
dust.update(dt, this.engine.stage.cameras.main);

// on a landing
dust.burst(8, hero.x, hero.y);

// in onExit
dust.destroy();
```

Particles live in world coordinates: moving the emitter trails new ones behind it rather than dragging the old ones
along. `update(dt, camera)` with the camera skips spawning and drawing while the emitter and its particles are off
screen (within `cullMargin`, 64 px by default). [`examples/platformer/Effects.ts`](/examples#platformer) has the dust
and an additive coin sparkle.

## Curves and ranges

A **range** is a number or `[min, max]`, rolled once per particle. A **curve** changes over a particle's life, sampled
from 0 (born) to 1 (gone):

- a number: the same the whole life;
- `{ start, end }`: a straight line;
- keyframes `[[t, value], …]`: straight lines between them, held flat before the first and after the last. A puff that
  swells fast then fades slowly is three keys, not a function.

`size`, `alpha` and `tint` are curves (the tint mixes `0xrrggbb` per channel); `lifetime`, `speed`, `rotation` and
`spin` are ranges. `sizeVariance` (0–1) lets each particle differ from the curve.

## Options that matter

| Option | Default | What |
|---|---|---|
| `capacity` | 256 | particles this emitter holds at once |
| `rate` | 0 | per second while emitting; 0 is bursts only |
| `blend` | `'normal'` | `'add'` for glows, sparks and fire |
| `area` | the point | `{ radius }` or `{ width, height }` round the emitter |
| `thinFactor` | 0.35 | share kept under reduced effects or the battery saver |
| `budget` | `particleBudget` | the budget shared with other emitters |
| `random` | `Math.random` | a `seededRandom(seed)` makes an emitter replayable |

## The budget and the player's settings

Every emitter shares `particleBudget` (4000 alive at once) unless handed its own `new ParticleBudget(limit)`. Under
`engineSettings` `reducedFx` or `batterySaver`, bursts and rates are thinned by `thinFactor` and the budget's limit
shrinks by its own. A game mirrors its settings there:

```ts
import { engineSettings } from '1681-engine';
engineSettings.set({ reducedFx: settings.reduceEffects, batterySaver: settings.saveBattery });
```

Thinning rounds at random, so a burst of 3 at 0.35 still gives one particle about every time rather than never. A
rate below one particle a frame is carried over between frames, so 30 a second at 144 fps still emits.

## Pitfalls

- One emitter draws one texture. A frame of an atlas works (frames share a source); a second look is a second emitter.
- Call `update` every frame, even while not emitting: the particles in the air still move and die, and give their
  share of the budget back.
- `clear()` drops every particle at once (a cancelled effect); `destroy()` in `onExit` frees the container.
- `ParticleSim` is the pure core (flat typed arrays, no Pixi): use it to test a recipe under node, or to drive a
  drawing of your own.

## API

[`Emitter`](/api/index/classes/Emitter) · [`EmitterOptions`](/api/index/interfaces/EmitterOptions) ·
[`ParticleBudget`](/api/index/classes/ParticleBudget) · [`ParticleSim`](/api/index/classes/ParticleSim) ·
[`sampleCurve`](/api/index/functions/sampleCurve) · [`seededRandom`](/api/index/functions/seededRandom)
