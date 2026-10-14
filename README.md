# 1681 Engine

[![CI](https://github.com/Phadec/1681-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/Phadec/1681-engine/actions/workflows/ci.yml)
[![Docs](https://github.com/Phadec/1681-engine/actions/workflows/docs.yml/badge.svg)](https://phadec.github.io/1681-engine/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A 2D game engine for the web, built on [PixiJS 8](https://pixijs.com) and written in TypeScript, for games in any
art style: hand-drawn, HD, vector or pixel art. Pixel art gets a module of its own, **Dither**.

It grew out of a shipped online action RPG, so its pieces were made for a real game under real load: a fast ECS,
a fixed-step simulation a server can replay **bit for bit**, Tiled maps, input that works the same on keyboard,
gamepad and touch, and for pixel art, effects painted on the world's own pixel grid and dithered lighting.

```ts
import { Engine, Scene, defineComponent, system } from '1681-engine';

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

## Entry points

| Import | For | Holds |
|---|---|---|
| `1681-engine` | every 2D game | engine, scenes, ECS, rendering core, assets, Tiled maps, animation, input, camera, rig maths, audio, networking |
| `1681-engine/pixel` | pixel-art games | `PixelLayer`, `pixelPaint` shapes, colour ramps, dithered `Darkness` lighting, `Evaporation`, sprite pixel tools |
| `1681-engine/ui` | games with menus and a HUD | canvas widgets, focus, the pure layout maths, the DOM/React bridge (`DomOverlay`, `createStore`, `InputShield`) |
| `1681-engine/postfx` | full-screen effects | `PostFx` (a chain of filters, flashes, shockwaves, animated uniforms), bloom, vignette, colour adjust, chromatic aberration, CRT, pixelate, shockwave, and `FxFilter` to write your own in GLSL and WGSL |
| `1681-engine/mobile` | a phone app on Capacitor | `capacitorConfig`, the Android back button (`BackStack`), `safeAreaInsets`, `keepScreenOn`, `nativeBuildOf`; Capacitor is handed in, never imported |
| `1681-engine/react` | a UI written in React | `Panel`, `TabStrip`, `SplitPane`, `Select`, `Tooltip`/`TitleTips`, `ConfirmDialog`, `ChoiceDialog`, `Slider`, `PixelImage`, `Glyph`, `UiProvider`, `useStore`, themed by CSS custom properties (`baseCss`) |

The core never imports the pixel module (a test holds it to that), so a game that does not use it does not ship it.
React and React DOM (19) are optional peer dependencies needed only by `1681-engine/react`; nothing else imports React.
Start a pixel-art game with `Engine.create({ pixelPerfect: true })`: sharp textures and a camera that lands on whole
pixels. Without it, textures are smooth and drawn at the screen's own density.

## Features

| Area | What you get |
|---|---|
| **Engine** | `Engine` (canvas, renderer, frame loop), a stack of `Scene`s (`replace`, `push`, `pop`, async loading), a fixed-step `FixedLoop` with interpolation and spiral-of-death protection, typed `EventBus`. |
| **ECS** | `World` on sparse sets, prefabs with variants (`definePrefab`, `PrefabLibrary` from data): typed components, `query`, allocation-free `each`, numeric components in typed-array columns (`defineFields`) walked through a cached `slots()` list — a step over 50,000 bodies in 0.1 ms. Systems in `fixed` and `frame` phases, recycled ids with generations, error isolation. |
| **Assets** | `AssetLoader`: images, sprite sheets, JSON, text and Tiled maps with their tilesets, with progress and a concurrency limit. |
| **Tilemaps** | Tiled JSON maps (CSV or base64 layers, groups, objects, properties, flipped tiles), drawn in culled chunks by `TilemapView`, with collision from a layer or a tile property. |
| **Animation** | `Animator` clips (fps or per-frame durations, looping or finishing) and an animation system for sprites. |
| **Input** | `Actions`: named actions bound to keys, chords, gamepad buttons and sticks, and on-screen touch buttons, with per-step edges and analog values. `Keymap` rebinding of keys and pad buttons, `InputCapture` for "press a key", input recording and exact replay, `AimGesture` and `TargetLock` for touch, stick maths, touch detection. [Guide](docs/guide/input.md) |
| **Camera** | Zoom, bounds, shake, flash, and `track` with a soft follow that is the same at any frame rate, a deadzone and an offset. |
| **Rendering** | `Stage` with world and screen layers, display objects, tweens, timers, bitmap labels, a texture atlas that splits pages by the GPU's limit, guards that keep one bad frame from stopping the loop. |
| **Characters** | A 2D skeleton rig drawn by `RigView` from cut-out images or vector shapes, `PosePlayer` blending key poses with crossfades, and a built-in humanoid with 72 poses and ready clips (idle, walk, run, roll, slash, thrust, cast, throw, emotes). |
| **Light** | `LightLayer`: smooth darkness with soft radial lights, colour washes and flicker (the pixel module has its own dithered `Darkness`). |
| **Audio** | Web Audio `sound` engine (synthesized recipes, recorded takes cleaned in a worker, voice limiting, distance muffling, panning), `SpatialAudio` for looping sounds placed in the world, and `music`: streamed tracks crossfaded and looped. iOS unlock handled. [Guide](docs/guide/audio.md) |
| **Multiplayer** | An authoritative `Room` and its socket host for Node, a client `Connection`, `PredictedMover` (prediction and reconciliation over deterministic movement: in tests and in the example the server never has to correct it), `InterpolationBuffer` for everyone else, binary snapshots, clock sync, input validation and flood limits, cadence rules, bodies the server moves, interest management by distance and lag compensation for shots. A `LobbyHost` with rooms (host, codes, ready, chat, settings), a rating `Matchmaker` that keeps parties whole and balances teams, ready checks with decline lockouts, and a `LobbyClient`. [Guide](docs/guide/lobby.md) |
| **Pixel art** (`/pixel`) | `PixelLayer` (thousands of pixel rects in one pooled texture), `pixelPaint` shapes shaded from hue-shifted ramps and faded by ordered dither, `Darkness` with dithered lamps and transient lights, `Evaporation`, the selective outline. |
| **UI** (`/ui`) | Canvas widgets with keyboard and gamepad focus, the pure layout maths, and a DOM/React bridge laid over the canvas. [Guide](docs/guide/ui.md) |
| **React kit** (`/react`) | Windows, tabs, split panes, drop-downs, tooltips and dialogs that never overflow the screen, themed by `--e1681-*` properties. [Guide](docs/guide/react.md) |
| **Physics** | `PhysicsWorld`: circles, boxes and convex polygons that turn when asked (contact points, torque, rolling), sensors, layers, kinematic platforms and spinners, one-way `preSolve`, raycasts, tiles merged into boxes with snag-free seams. [Guide](docs/guide/physics.md) |
| **Post-processing** (`/postfx`) | Bloom, vignette, colour grade and flash, chromatic aberration, CRT, pixelate, shockwaves; WebGL and WebGPU. [Guide](docs/guide/post-processing.md) |
| **Particles** | `Emitter` on one pooled `ParticleContainer`, curves over life, a shared budget that thins under reduced effects. [Guide](docs/guide/particles.md) |
| **Navigation** | A* `findPath` with reach, costs and end-only tiles, `straightenPath`, `floodFill`, `nearestOpen`; flow fields for crowds and steering (seek, arrive, separation, flocking). [Guide](docs/guide/navigation.md) |
| **AI** | Behaviour trees shared by many agents, reactive composites that halt what they interrupt, a trace, trees from JSON. [Guide](docs/guide/behaviour-trees.md) |
| **Dialogue** | Branching scripts as data with conditions, variables, commands, translation and saves; a checker and a playground. [Guide](docs/guide/dialogue.md) |
| **Saves** | `SaveStore` slots with migrations, checksums and a backup, pluggable backends, `Autosaver`. [Guide](docs/guide/saves.md) |
| **Transitions** | `transitionTo` with fade, crossfade and dithered wipe, `Letterbox`. [Guide](docs/guide/transitions.md) |
| **Localisation** | `Translator` with the English source as key, contexts, plurals, live switching; `extractStrings`. [Guide](docs/guide/i18n.md) |
| **Ambient** | `DayClock`, deterministic `weatherAt` and `WeatherLayer`, `ColorGrade`; in `/pixel`, `NightShade`, `SwayProp`, `DitherVignette`. [Guide](docs/guide/ambient.md) |
| **Game feel** | Pooled `FloatingText` for damage numbers, hit-stop, recoil and flash curves. [Guide](docs/guide/game-feel.md) |
| **LDtk and autotiling** | LDtk projects (IntGrid, auto-layers, entities with fields, world layouts, level files) read into the same tile map as Tiled; 4-bit and 47-tile blob autotiling that retiles only what an edit touched. [Guide](docs/guide/tilemap.md) |
| **Ambient life** | Drifting leaves, embers and ash, birds, butterflies, fireflies and chimney smoke, pooled and alive only in view. [Guide](docs/guide/ambient.md) |
| **Desktop** (`/electron`, `/updates`) | File-by-file web patching by sha256, an OS-encrypted session store and a window lockdown for Electron; the update rules shared with phones. [Guide](docs/guide/desktop.md) |
| **Mobile** (`/mobile`) | A Capacitor config with a game's defaults, the Android back button, the safe area, a screen kept on, the native build for over-the-air updates. [Guide](docs/guide/mobile.md) |
| **Diagnostics** | Error capture, WebGL context loss, a boot watch, frame sampling, and a `DebugOverlay` with collision boxes. [Guide](docs/guide/diagnostics-and-debug.md) |

### A React UI

```tsx
import { createRoot } from 'react-dom/client';
import { ConfirmDialog, Panel, TitleTips, UiProvider, askConfirm, injectBaseCss } from '1681-engine/react';

injectBaseCss(); // the base stylesheet, first in <head>, so the game's own CSS wins
// theme it with custom properties: frames are 9-slice border-images the game draws
document.documentElement.style.cssText += `
  --e1681-font: 'My Pixel Font'; --e1681-accent: #f0c060;
  --e1681-frame: url(/ui/frame.svg); --e1681-frame-slice: 16 20 20 16 fill; --e1681-frame-width: 16px 20px 20px 16px;`;

createRoot(document.getElementById('ui')!).render(
  <UiProvider labels={{ cancel: 'Annuler', ok: 'OK' }}>
    <Panel title="Inventory" onClose={close} width={420}>…</Panel>
    <ConfirmDialog />
    <TitleTips />
  </UiProvider>,
);
if (await askConfirm('Drop the sword?')) drop();
```

Windows and dialogs are fitted into the screen by `fitToViewport` and placed in whole pixels; tooltips and the
select's list by `placeTooltip` and `listWidth`. On a touch device (`isTouchUi`, or `UiProvider touch`) a `Panel` is a
full-screen sheet and tooltips are off. Every word the kit prints is a prop or a `labels` entry with an English default.

## Install

```sh
npm install 1681-engine pixi.js
```

`pixi.js` (8.6 or later) is a peer dependency. The package is ESM only and ships its TypeScript types. On a server
(the multiplayer `Room`) it needs Node 22 or later.

The engine renders with **WebGL 2** by default. `Engine.create({ preference: 'webgpu' })` opts into WebGPU, which
is experimental here: it falls back to WebGL where the browser lacks it, but has not been profiled the way the WebGL
path has.

## Documentation

**https://phadec.github.io/1681-engine/** — the guide, the API reference and the examples running live.

The documentation site (guide, API reference generated from the source, live examples) is built with
`npm run docs:build` and published to GitHub Pages by `.github/workflows/docs.yml`; `npm run docs:dev` serves it
locally.

- [Getting started](docs/guide/getting-started.md): an engine, a scene, entities and systems, assets, a Tiled map, input,
  the camera, a rigged character, light and music, and multiplayer, step by step.
- [Architecture](docs/guide/architecture.md): how the frame loop, scenes, ECS and rendering fit together, and the rules that keep it fast.
- A page per module: [input](docs/guide/input.md), [physics](docs/guide/physics.md), [navigation](docs/guide/navigation.md),
  [particles](docs/guide/particles.md), [game feel](docs/guide/game-feel.md), [ambient](docs/guide/ambient.md),
  [transitions](docs/guide/transitions.md), [post-processing](docs/guide/post-processing.md),
  [lobby and matchmaking](docs/guide/lobby.md), [UI](docs/guide/ui.md), [React kit](docs/guide/react.md),
  [localisation](docs/guide/i18n.md), [saves](docs/guide/saves.md), [diagnostics and debug](docs/guide/diagnostics-and-debug.md),
  [behaviour trees](docs/guide/behaviour-trees.md), [dialogue](docs/guide/dialogue.md), [mobile](docs/guide/mobile.md).
- [Examples](examples/), run with `npm run dev`:
  - `top-down`: a Tiled map, asset loading, an animated hero, input actions on keyboard, gamepad and touch, camera follow.
  - `platformer`: physics from a tile grid (crates, a moving platform, one-way planks, sensor coins), particles, a canvas
    HUD and pause dialog, a versioned save, scene transitions, two languages, rebindable keys and a debug overlay.
  - `night-garden`: smooth vector art, a rigged hero animated by blended poses, a lantern and fireflies in the dark.
  - `pixel-dungeon`: the pixel module: dithered torchlight, a carried light, slimes that evaporate into their own pixels.
  - `ecs-stress`: tens of thousands of bodies on typed-array components, with the frame rate and step time.
  - `multiplayer`: `npm run example:server`, then two tabs: prediction, reconciliation and interpolation.
  - `physics-toys`: bodies that turn (crates, balls, polygons, a spinning bar) under bloom, a vignette and the other effects.
  - `lobby`: `npm run example:lobby`, then the page: rooms, codes, ready flags, chat, the queue and a ready check.
  - `walk-room`: the smallest whole game, with pixel effects.
  - `dialogue`: a playground for dialogue scripts, checked as they are typed and played with their variables in view.

## Develop

```sh
npm install
npm run dev        # examples at http://127.0.0.1:5180/
npm test           # unit tests under node
npm run typecheck  # sources and tests
npm run bench      # ECS benchmark
npm run build      # dist/: both ESM bundles and their .d.ts files
npm run check      # typecheck, test and build, as CI runs it
npm run docs:dev   # the documentation site, with the API reference and examples
```

Contributions are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

[MIT](LICENSE)
