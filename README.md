# Dither Engine

A 2.5D pixel-art game engine for the web, built on [PixiJS 8](https://pixijs.com) and written in TypeScript.

It grew out of a shipped action MMORPG, so its pieces were made for a real game under real load: effects painted on
the world's own pixel grid, dithered lighting that reads as pixel art rather than fog, a skeleton rig for small
characters, synthesized sound with distance muffling, touch controls for phones, and **deterministic movement a
server can replay bit for bit**.

```ts
import { Engine, Scene, defineComponent, system } from 'dither-engine';

const Position = defineComponent<{ x: number; y: number }>('Position');

class Level extends Scene {
  override onEnter() {
    this.world.spawn([Position, { x: 0, y: 0 }]);
    this.world.addSystem(
      system('drift', 'fixed', ({ world, dt }) => {
        for (const [, p] of world.query(Position)) p.x += 30 * dt;
      }),
    );
  }
}

const engine = await Engine.create({ parent: document.body, zoom: 3 });
await engine.scenes.replace(new Level());
```

> **Status: 0.x, early.** The API will change between minor versions until 1.0. See [CHANGELOG.md](CHANGELOG.md).

## Features

| Area | What you get |
|---|---|
| **Engine** | `Engine` (canvas, renderer, frame loop), a stack of `Scene`s (`replace`, `push`, `pop`, async loading), a fixed-step `FixedLoop` with interpolation and spiral-of-death protection, typed `EventBus`. |
| **ECS** | `World` with typed components (`defineComponent<T>`), queries, systems in `fixed` and `frame` phases, deferred destruction, per-system error isolation. |
| **Rendering** | `Stage` with world and screen layers, `Camera` (zoom, shake, snapping to whole pixels), `PixelLayer` (thousands of pixel rects baked into one pooled texture), tweens, timers, bitmap labels, a texture atlas that splits pages by the GPU's limit, guards that keep one bad frame from stopping the loop. |
| **Pixel effects** | `pixelPaint` shapes (rings, arcs, blobs, strokes, smoke puffs, debris) that shade themselves from hue-shifted ramps and fade by ordered dither; `Evaporation` (a body dissolving into its own pixels); hit-stop and recoil curves. |
| **Light** | `Darkness`: night, caves and dungeons with lamps cut out of the dark by dithered falloffs, coloured light washes, flicker, and short-lived lights for spells and blasts. |
| **Characters** | A 2D skeleton rig (`Skeleton`, pose blending and overlays), hue-shifted material ramps, the selective outline and a built-in 20×24 humanoid. Painting bodies from poses comes in a later release. |
| **Audio** | Web Audio `sound` engine: synthesized recipes, recorded takes cleaned in a worker, voice limiting, distance attenuation and muffling, stereo panning, iOS unlock handling. Music playback comes in a later release. |
| **Input** | `Keyboard` with per-step edges, analog stick maths, long press, touch-device detection. |
| **Networking** | Deterministic tile movement with dodge rolls (`stepMover`), a 16-byte binary snapshot record codec, action cadence rules that forgive jitter without letting clients cheat, and a server clock estimator. |

## Install

```sh
npm install dither-engine pixi.js
```

`pixi.js` (8.6 or later) is a peer dependency. The package is ESM only and ships its TypeScript types.

The engine renders with **WebGL 2** by default. `Engine.create({ preference: 'webgpu' })` opts into WebGPU, which
is experimental here: it falls back to WebGL where the browser lacks it, but has not been profiled the way the WebGL
path has.

## Documentation

- [Getting started](docs/getting-started.md): an engine, a scene, entities and systems, step by step.
- [Architecture](docs/architecture.md): how the frame loop, scenes, ECS and rendering fit together, and the rules that keep it fast.
- [Examples](examples/): `walk-room`, a complete little game in one file. Run them with `npm run dev`.

## Develop

```sh
npm install
npm run dev        # examples at http://127.0.0.1:5180/
npm test           # unit tests under node
npm run typecheck  # sources and tests
npm run build      # dist/: the ESM bundle and .d.ts files
npm run check      # all of the above, as CI runs it
```

Contributions are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

[MIT](LICENSE)
