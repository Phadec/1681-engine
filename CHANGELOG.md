# Changelog

All notable changes to this package are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/); before 1.0 a minor version may break the API.

## Unreleased

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
