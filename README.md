# Lantern Engine

A 2D game engine for the web, built on [PixiJS 8](https://pixijs.com) and written in TypeScript, for games in any
art style: hand-drawn, HD, vector or pixel art. Pixel art gets a module of its own, **Dither**.

It grew out of a shipped online action RPG, so its pieces were made for a real game under real load: a fast ECS,
a fixed-step simulation a server can replay **bit for bit**, Tiled maps, input that works the same on keyboard,
gamepad and touch, and for pixel art, effects painted on the world's own pixel grid and dithered lighting.

```ts
import { Engine, Scene, defineComponent, system } from 'lantern-engine';

const Position = defineComponent<{ x: number; y: number }>('Position');

class Level extends Scene {
  override onEnter() {
    this.world.spawn([Position, { x: 0, y: 0 }]);
    this.world.addSystem(
      system('drift', 'fixed', ({ world, dt }) => {
        world.each(Position, (_e, p) => (p.x += 30 * dt));
      }),
    );
  }
}

const engine = await Engine.create({ parent: document.body });
await engine.scenes.replace(new Level());
```

> **Status: 0.x, early.** The API will change between minor versions until 1.0. See [CHANGELOG.md](CHANGELOG.md).

## Two entry points

| Import | For | Holds |
|---|---|---|
| `lantern-engine` | every 2D game | engine, scenes, ECS, rendering core, assets, Tiled maps, animation, input, camera, rig maths, audio, networking |
| `lantern-engine/pixel` | pixel-art games | `PixelLayer`, `pixelPaint` shapes, colour ramps, dithered `Darkness` lighting, `Evaporation`, sprite pixel tools |

The core never imports the pixel module (a test holds it to that), so a game that does not use it does not ship it.
Start a pixel-art game with `Engine.create({ pixelPerfect: true })`: sharp textures and a camera that lands on whole
pixels. Without it, textures are smooth and drawn at the screen's own density.

## Features

| Area | What you get |
|---|---|
| **Engine** | `Engine` (canvas, renderer, frame loop), a stack of `Scene`s (`replace`, `push`, `pop`, async loading), a fixed-step `FixedLoop` with interpolation and spiral-of-death protection, typed `EventBus`. |
| **ECS** | `World` on sparse sets: typed components, `query`, allocation-free `each`, numeric components in typed-array columns (`defineFields`) walked through a cached `slots()` list — a step over 50,000 bodies in 0.1 ms. Systems in `fixed` and `frame` phases, recycled ids with generations, error isolation. |
| **Assets** | `AssetLoader`: images, sprite sheets, JSON, text and Tiled maps with their tilesets, with progress and a concurrency limit. |
| **Tilemaps** | Tiled JSON maps (CSV or base64 layers, groups, objects, properties, flipped tiles), drawn in culled chunks by `TilemapView`, with collision from a layer or a tile property. |
| **Animation** | `Animator` clips (fps or per-frame durations, looping or finishing) and an animation system for sprites. |
| **Input** | `Actions`: named actions bound to keys, gamepad buttons and sticks, and on-screen touch buttons, with per-step edges and analog values. `Keyboard`, stick maths, long press, touch detection. |
| **Camera** | Zoom, bounds, shake, flash, and `track` with a soft follow that is the same at any frame rate, a deadzone and an offset. |
| **Rendering** | `Stage` with world and screen layers, display objects, tweens, timers, bitmap labels, a texture atlas that splits pages by the GPU's limit, guards that keep one bad frame from stopping the loop. |
| **Characters** | A 2D skeleton rig drawn by `RigView` from cut-out images or vector shapes, `PosePlayer` blending key poses with crossfades, and a built-in humanoid with 72 poses and ready clips (idle, walk, run, roll, slash, thrust, cast, throw, emotes). |
| **Light** | `LightLayer`: smooth darkness with soft radial lights, colour washes and flicker (the pixel module has its own dithered `Darkness`). |
| **Audio** | Web Audio `sound` engine (synthesized recipes, recorded takes cleaned in a worker, voice limiting, distance muffling, panning) and `music`: streamed tracks crossfaded and looped. iOS unlock handled. |
| **Multiplayer** | An authoritative `Room` and its socket host for Node, a client `Connection`, `PredictedMover` (prediction and reconciliation over deterministic movement: in tests and in the example the server never has to correct it), `InterpolationBuffer` for everyone else, binary snapshots, clock sync, input validation and flood limits, cadence rules. |
| **Pixel art** (`/pixel`) | `PixelLayer` (thousands of pixel rects in one pooled texture), `pixelPaint` shapes shaded from hue-shifted ramps and faded by ordered dither, `Darkness` with dithered lamps and transient lights, `Evaporation`, the selective outline. |

## Install

```sh
npm install lantern-engine pixi.js
```

`pixi.js` (8.6 or later) is a peer dependency. The package is ESM only and ships its TypeScript types.

The engine renders with **WebGL 2** by default. `Engine.create({ preference: 'webgpu' })` opts into WebGPU, which
is experimental here: it falls back to WebGL where the browser lacks it, but has not been profiled the way the WebGL
path has.

## Documentation

- [Getting started](docs/getting-started.md): an engine, a scene, entities and systems, assets, a Tiled map, input,
  the camera, a rigged character, light and music, and multiplayer, step by step.
- [Architecture](docs/architecture.md): how the frame loop, scenes, ECS and rendering fit together, and the rules that keep it fast.
- [Examples](examples/), run with `npm run dev`:
  - `top-down`: a Tiled map, asset loading, an animated hero, input actions on keyboard, gamepad and touch, camera follow.
  - `night-garden`: smooth vector art, a rigged hero animated by blended poses, a lantern and fireflies in the dark.
  - `multiplayer`: `npm run example:server`, then two tabs: prediction, reconciliation and interpolation.
  - `walk-room`: the smallest whole game, with pixel effects.

## Develop

```sh
npm install
npm run dev        # examples at http://127.0.0.1:5180/
npm test           # unit tests under node
npm run typecheck  # sources and tests
npm run bench      # ECS benchmark
npm run build      # dist/: both ESM bundles and their .d.ts files
npm run check      # typecheck, test and build, as CI runs it
```

Contributions are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

[MIT](LICENSE)
