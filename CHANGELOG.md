# Changelog

All notable changes to this package are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/); before 1.0 a minor version may break the API.

## Unreleased

### Changed

- `World` stores components in sparse sets instead of maps: a query over 50,000 bodies went from 21 ms to 2 ms a
  step, and spawning and destroying makes a third of the garbage. Entity ids are recycled with a generation, so a
  stale id never matches the entity that reuses its slot. Entities are walked last-added first.
- Removing a component while a walk is in progress is deferred like destroying an entity, so nothing is skipped.

### Added

- `world.each(A, B, fn)`: walks without allocating a row per entity.
- `defineFields(name, { x: 'f32', … })`: numeric components kept in typed-array columns (`world.columns`).
- `world.slots(A, B)`: the matching slot indices as a cached `Int32Array`, rebuilt only when membership changes.
  With field components a step over 50,000 bodies takes 0.1 ms, 200 times the first release.
- `world.count(type)`, `entityIndex(e)`, `npm run bench`.

## 0.1.0

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
