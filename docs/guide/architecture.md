# Architecture

## One frame

```
Pixi ticker ──▶ Stage.frame(delta)
                 ├─ sync size (resize listeners)
                 ├─ update ──▶ Engine.tick
                 │              ├─ FixedLoop.advance(delta)
                 │              │    └─ per step: world.run('fixed') → scene.fixedUpdate(dt)
                 │              ├─ world.run('frame') → scene.update(dt, alpha)
                 │              └─ events.emit('frame')
                 ├─ tweens
                 ├─ timers
                 └─ camera (follow, shake, snap)
Pixi renders
```

Every step of `Stage.frame` is **guarded**: a throw is logged once per distinct message, reported on
`engine.events` (`'error'`), and the steps after it still run. A ticker listener that throws never asks for the next
frame, so without the guard one bad frame stops the game for good.

## Modules

| Folder | Depends on | Holds |
|---|---|---|
| `engine/` | `core`, `ecs`, `events` | `Engine`, `Scene`, `SceneManager`, `FixedLoop` |
| `ecs/` | — | `World` (sparse sets), field components, systems |
| `events/` | — | `EventBus` |
| `core/` | pixi.js | `Stage`, `Camera`, display objects, textures, atlas, `Tweener` and `Timeline` |
| `assets/` | `tilemap`, `audio` (the sound context) | `AssetLoader`, the TexturePacker atlas reader |
| `tilemap/` | `net` (collision), `core` (view) | the Tiled reader, collision, `TilemapView` |
| `anim/` | `ecs`, `core` | `Animator`, the animation system, Aseprite import (`parseAseprite`), `AnimStateMachine` |
| `rig/` | — (`RigView`: pixi.js) | skeleton, pose maths, `PosePlayer`, the humanoid's poses and clips, `RigView` |
| `light/` | `core` | `LightLayer` |
| `fx/` | — (`FloatingText`: `core`) | hit-stop and recoil curves, view culling, pooled floating text |
| `audio/` | Web Audio | `sound`, synth, sample bank, `music` in channels, `Footsteps` |
| `input/`, `platform/` | DOM | `Actions`, keyboard, sticks, rumble, touch detection, `Keymap` rebinding, `AimGesture`, `TargetLock`; fullscreen, orientation, pointer lock, reduced motion, `onAppResume`, `timeoutSignal` |
| `ambient/` | `core` | `DayClock`, `weatherAt`, `WeatherLayer`, `ColorGrade` |
| `parallax/` | `core` | `Parallax`, `ParallaxLayer` (scenery scrolling at a share of the camera's travel), pure `parallaxMath` |
| `particles/` | `core`, pixi.js | `Emitter` on a `ParticleContainer`, `ParticleSim`, a shared `ParticleBudget` |
| `physics/` | — (pure; `physicsSystem`: `ecs`) | `PhysicsWorld`: rigid circles and boxes, contacts, raycasts, `tileBodies` |
| `nav/` | — | A* `findPath`, `straightenPath`, `floodFill`, `nearestOpen` |
| `save/` | — (`WebStorageBackend`: DOM) | `SaveStore` slots with migrations and checksums, `Autosaver` |
| `transitions/` | `engine`, `core` | `transitionTo` with fade, crossfade and dithered wipe, `Letterbox` |
| `i18n/` | — | `Translator`, `formatMessage`, `extractStrings` |
| `diagnostics/`, `debug/` | `core`, `engine` | context loss, boot watch, frame sampling, error capture; `DebugOverlay` |
| `ui/` | `core`, DOM | the UI module (`1681-engine/ui`): canvas widgets, focus, the pure layout maths, the DOM/React bridge |
| `react/` | `ui` (layout maths, `createStore`), `platform`, React 19 (optional peer) | the React kit (`1681-engine/react`): `Panel`, `TabStrip`, `SplitPane`, `Select`, `Tooltip`, `TitleTips`, `ConfirmDialog`, `ChoiceDialog`, `Slider`, `PixelImage`, `Glyph`, `UiProvider`, `useStore`, `baseCss` themed by custom properties |
| `net/` | — (pure; `Connection`: WebSocket, `platform/appResume`) | movement, snapshot codec, cadence, server clock, the netcode protocol, `PredictedMover`, `InterpolationBuffer`, `Room`, `RoomHost`, `Connection` |
| `pixel/` | the core | the pixel-art module (`1681-engine/pixel`): `PixelLayer`, `pixelPaint`, `paintLayer`, ramps, `Darkness`, `Evaporation`, `NightShade`, `SwayProp`, `DitherVignette`, `nineSlice` |

The core never imports `pixel/`, and nothing outside `react/` imports React or the kit; `src/architecture.test.ts`
fails if either does. `ecs/`, `events/`, `net/`, `rig/` and
the Tiled reader import nothing from Pixi or the DOM, so they run under node: that is where most unit tests live, and
where a server can import the movement and collision code from.

## The engine knows no game

1681 Engine grew out of one game, and it stays useful to the next one only if nothing in it belongs to that game. What
differs between games is a parameter or something the game hands in at start-up, never a table written into the
engine:

| A game brings | Through |
|---|---|
| its materials (glass, slime, bark…) or other shading for a built-in one | `registerMaterial(name, { light, factors })` |
| ramps picked by hand for its effect colours | `registerHandRamps([[colour, { hi, light, deep, shade }], …])` |
| its sounds: synth recipes and recorded takes | `registerSounds`, `registerTakes` |
| the letters its labels print beyond ASCII (bitmap label fonts bake ASCII only otherwise) | `addLabelGlyphs` for every font, or `glyphs` on `installLabelFont` / `Label.bitmap` / `FloatingText` for one |
| its colours for outlines and shadows | the `dark` / `core` / `rim` parameters of `selectiveOutline`, `litOutline`, `groundShadow`; `PALETTE` is only a default |
| its settings (volume, reduced effects, battery saver) | `engineSettings.set`, mirrored from its own store |
| which presses its pointer ignores, whether it is a native shell | `Pointer.ignorePress`, `setNativeShell` |

Something belongs in the engine when a second game would use it as it is; anything named after a game's content (its
classes, regions, items, people) stays in that game. `src/architecture.test.ts` fails on a game's names or on text
in a game's language anywhere in `src/`.

## Rules that keep it fast

These came from profiling a real game on phones; keep to them when you add code.

1. **Paint whole world pixels.** Effects, lights and bodies are drawn on the 1-px world grid and snapped there. A
   sprite scaled by a fraction lands 2.94 pixels at one size and 3 at the next, and reads as a different art style.
2. **Batch pixels into one texture.** A `PixelLayer` writes rects into a pooled buffer uploaded once a frame;
   thousands of single-pixel `Graphics` rects were most of a fight's CPU on a phone.
3. **Never block a frame with a one-off job.** Pure work (decoding and cleaning audio, painting large ground) goes to
   a worker; work that must touch the main thread is handed over one item per task (`setTimeout(…, 0)`). Fonts and
   light falloffs are made ahead (`installLabelFont`, `Darkness`' warm-up).
4. **Pool, don't create.** Textures, filters and buffers are pooled or shared. A texture per effect ran to a hundred a
   second and leaked through Pixi's batch tables (`core/pixiPatches.ts` fixes Pixi's own leak).
5. **Guard every step, report every error once.** See "One frame" above.
6. **Lists walked every frame are never mutated while walked.** `World` defers destruction to the end of a run;
   `EventBus` replaces its listener list instead of editing it.

## ECS storage

Each component type is a sparse set: `sparse[slot]` points into packed `entities`/`values` arrays, so a lookup is two
array reads and a walk is a walk over flat arrays. Field components (`defineFields`) keep their numbers in one typed
array per field, indexed by slot, and `slots()` caches the matching slot list per set of components, keyed on each
set's membership version. Measured with `npm run bench` (node 24, one core), a movement step:

| Bodies | Maps (0.1.0) | `each`, objects | `slots`, fields |
|---|---|---|---|
| 10,000 | 0.98 ms | 0.07–0.13 ms | 0.02 ms |
| 50,000 | 21 ms | 0.4–1.3 ms | 0.1 ms |
| 200,000 | — | — | 0.5 ms |

## Determinism

`net/movement.ts` is written so a port in another language gives the same doubles: the operation order is fixed,
`DIAGONAL` is a literal, and nothing reads the clock. A client predicts with it and replays unacknowledged steps after
each snapshot; a server runs it as the authority. Run movement only in `fixed` systems, with the same `MovementParams`
on both sides.

`net/snapshotCodec.ts` packs a body's state (`[id, x, y, aim, anim, hp, flags]`) into 16 bytes: position to 1/8 px,
aim to 1/256 of a turn. `quantizeUpdates` applies the same rounding without the bytes, for a local simulation that
must move on the same grid the server sends.
