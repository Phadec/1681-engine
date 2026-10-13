# Changelog

All notable changes to this package are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/); before 1.0 a minor version may break the API.

## Unreleased

### Added

- A documentation site (VitePress): home, guide, an API reference generated from the source by TypeDoc, the changelog,
  and the examples running live; `npm run docs:dev` / `docs:build`, published by a GitHub Pages workflow.
- Examples `pixel-dungeon` (dithered torchlight, a carried light, evaporating slimes) and `ecs-stress` (tens of
  thousands of bodies with the frame rate and step time).
- Types the public API refers to are exported too: `ComponentValues`, `ArrayOf`, `SettingsListener`, `Tween`,
  `TweenConfig`, `TweenTarget`, `EaseFn`, `Vec2`, `AtlasPlan`, `AtlasPage`, `CameraLike`, `SoundEngine`,
  `SoundOptions`, `TiledPropertyValue`; `PackedPixels` is exported as a class from the pixel module.

## 0.3.0

### Added

- Characters: `RigView` draws a rig from cut-out images or vector shapes (origin at the feet, mirrored by `facing`,
  joints readable for held items); `PosePlayer` blends key poses with crossfades between clips; `HUMANOID_POSES` (72)
  and `HUMANOID_CLIPS`.
- `LightLayer`: smooth darkness with soft lights, colour washes and flicker.
- `music` / `MusicPlayer`: streamed tracks, crossfaded, looping, at the music volume, iOS-safe.
- Multiplayer: the netcode protocol, `PredictedMover` (prediction and reconciliation), `InterpolationBuffer`, an
  authoritative `Room` with input validation and flood limits, `RoomHost` for any Node WebSocket library, and a
  client `Connection` with batching, clock sync and reconnection. Tested end to end with simulated latency and jitter,
  and through real sockets in the example.
- Examples `night-garden` (smooth art, rig, lights) and `multiplayer` (`npm run example:server`).

## 0.2.0

The engine is now **Lantern Engine** (`lantern-engine`), for 2D games in any art style; the pixel-art tools moved to
their own module, **Dither** (`lantern-engine/pixel`).

### Breaking

- Pixel-art exports moved to `lantern-engine/pixel`: `PixelLayer`, `pixelPaint`, `pixelTone`, the colour and pixel-grid
  helpers, `PALETTE`, the prop kit, `ramp`/`selectiveOutline`, `Darkness` and the transient lights, `Evaporation`,
  `spritePixels`.
- `stage.add.pixels()` is gone: use `addPixelLayer(stage)` from the pixel module, or `stage.add.existing(obj)` for any
  object made elsewhere.
- `EngineOptions.pixelArt` (default on) is now `pixelPerfect` (default off). Off, textures are smooth, antialiased and
  drawn at the screen's density; on, they are sharp, at one backing pixel per CSS pixel, and the camera lands on
  whole pixels (`Camera.roundPixels`).
- `createCollisionGrid`'s fifth argument is an options object (`ground`, `shotOverTiles`, `bodyHalfWidth`,
  `bodyHalfHeight`); `setShotOverTiles` is gone.

### Added

- `AssetLoader`: images, sprite sheets, JSON, text and Tiled maps with their tileset images, progress, a concurrency
  limit, errors that name the URL.
- Tiled maps: `parseTiled` (CSV and base64 layers, groups, objects, properties, flips, tile animations; clear refusals
  for what is not supported), `collisionFromTiled` (a layer or a tile property), `TilemapView` (layers drawn in culled
  chunks, each at its own depth among the bodies).
- `Animator` (fps or per-frame durations, loop or finish, speed) and `animationSystem` with `SpriteComponent` and
  `AnimationComponent`.
- `Actions`: named input bound to keys, gamepad buttons and sticks (with a dead zone), and virtual touch buttons; per-step
  edges, analog values, rebinding.
- `Camera.track`: a soft follow that is the same at any frame rate, a deadzone, an offset, the bounds kept.
- Example `top-down` with a Tiled map, written by `examples/top-down/make-assets.mjs`.
- `world.each(A, B, fn)`: walks without allocating a row per entity.
- `defineFields(name, { x: 'f32', … })`: numeric components kept in typed-array columns (`world.columns`).
- `world.slots(A, B)`: the matching slot indices as a cached `Int32Array`, rebuilt only when membership changes.
  With field components a step over 50,000 bodies takes 0.1 ms, 200 times the first release.
- `world.count(type)`, `entityIndex(e)`, `npm run bench`.

### Changed

- `World` stores components in sparse sets instead of maps: a query over 50,000 bodies went from 21 ms to 2 ms a
  step, and spawning and destroying makes a third of the garbage. Entity ids are recycled with a generation, so a
  stale id never matches the entity that reuses its slot. Entities are walked last-added first.
- Removing a component while a walk is in progress is deferred like destroying an entity, so nothing is skipped.

## 0.1.0 (as Dither Engine)

First release, split out of a shipped game's client.

### Added

- `Engine`, `Scene`, `SceneManager` (replace, push, pop, async `onEnter`) and `FixedLoop` (fixed-step simulation with
  interpolation and a cap on catch-up steps).
- `World` ECS: typed components, queries, `fixed` and `frame` systems, deferred destruction, error isolation.
- `EventBus` with `once`, `off`, `listenerCount` and listener error isolation.
- Rendering core: `Stage`, `Camera`, `PixelLayer`, display objects, tweens, timers, bitmap labels, texture atlas.
- Pixel effects: `pixelPaint`, `pixelTone`, `Evaporation`, hit-stop and recoil curves.
- Lighting: `Darkness` with dithered lamps and transient lights.
- Skeleton rig, pose blending, material ramps, selective outline and `HUMANOID_RIG`.
- Audio: `sound`, synthesized recipes (`registerSounds`), recorded takes (`registerTakes`).
- Input: `Keyboard`, stick maths, long press, touch detection.
- Networking: deterministic `stepMover` with a configurable body box, binary snapshot codec, cadence rules, server
  clock.
- Example: `walk-room`.
