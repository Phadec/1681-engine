# Changelog

All notable changes to this package are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/); before 1.0 a minor version may break the API.

## 0.6.0

### Added

- **Interest management**: `Room` takes `interest: { radius, leaveMargin, canSee }` and sends each player only the
  bodies near it, with a margin so one on the edge is not spawned and removed over and over. `room.place(id, x, y)`.
  `SpatialHash` (points in square cells, `near` and `inRect`) is exported for a game's own use.
- **Lag compensation**: `Room` takes `rewindMs` and keeps `history`, a `LagCompensator` recorded as each round of
  snapshots goes out and blended as `InterpolationBuffer` blends, so a shot is judged against what the shooter saw:
  `at`, `all`, `near`, `alongRay`. `RoomHost.rewindTime(claimed)` and `LagCompensator.clampTime` hold a client's
  claim within the window; `InterpolationBuffer.viewTime(now)` is the time a client sends with a shot.
- **Server bodies**: `Room.addBody(data, x, y)` and `removeBody` for monsters, projectiles and crates the server
  moves, sent beside the players with the same interest and rewind history (`RoomBody`, `RoomSeen`, `BODY_ID_BASE`).
  `canSee` now gets either kind.
- **Rebinding the gamepad**: `Keymap` keeps a first binding per device, so pad buttons are rebindable beside keys
  (`keysFor(action, device)`); `InputCapture` waits for the next key, pad button or stick push for a settings
  screen; `padLabel` and `deviceOf`.
- **Input replays**: `InputRecorder` keeps an `Actions`' steps as a JSON `InputTape` (changes only); `InputPlayer`
  plays one back through `Actions.replay`, exactly. `Actions.tap` hands every step's values to a listener.
- **Tools**: the `dialogue` example, a playground that checks a script as it is typed and plays it with its
  variables in view; `formatTrace` prints a behaviour tree's last tick.
- **Crowds**: `flowField` and `followField` (one search for a crowd, by `findPath`'s own rules), and steering:
  `seek`, `flee`, `arrive`, `separation`, `alignment`, `cohesion`, `followFlow`, `combineSteering`, `applySteering`.
- **Behaviour trees**: `BehaviorTree` and `BtAgent` (one tree, many agents, each with its own memory), `sequence`,
  `selector`, `reactiveSequence`, `reactiveSelector`, `parallel`, `invert`, `succeed`, `repeat`, `retry`, `cooldown`,
  `timeout`, `wait`, `condition`, `action` with `onHalt`, a trace for debugging, and `buildTree` from JSON.
- **Dialogue**: `DialogueRunner` runs a branching script written as data (lines, choices with conditions, `once`
  and locked choices, variables, commands, `{…}` in text, translation, save and restore); `validateDialogue` checks
  a script; `compileExpr` is its safe expression language.
- **Prefabs**: `definePrefab`, `prefabPart`, `spawnPrefab` and `isPrefabOf`, with variants laid over their base
  field by field; `PrefabLibrary` loads them from data.
- **Sounds in the world**: `SpatialAudio` places any buffer at a point, panned, faded and muffled by distance from a
  moving listener, loops paused out of range and picked up where they would be; `spatialMix` is the mix on its own.
- **`1681-engine/mobile`**: `capacitorConfig` (a Capacitor config with a game's defaults), `BackStack`,
  `doubleBackToExit` and `installBackButton` for Android's back button, `safeAreaInsets`, `keepScreenOn`, and
  `nativeBuildOf` for `pickWebUpdate`. Capacitor is handed in, never imported.

### Changed

- `RoomInterest.canSee(viewer, other)` gets a `RoomSeen` (a player or a body the server moves), told apart by
  `other.kind`; `RoomPlayer` has `kind: 'player'`. `Room` and `RoomHost` take a second type parameter for bodies' data.
- `Keymap.bind` replaces the action's first binding of the same device (a pad input its first pad input, a key its
  first key) instead of its first binding of any kind. Keymaps of keys only behave as before.

### Fixed

- `WebPatcher.tidy` called while the tidy `startEntry` began was still running deleted the same folders twice at
  once; one failed, and the old webs after it were left on disk. Calls now run one after another.
- `ScrollView.measure` read the content as no taller than the view (Pixi cuts a masked container's bounds to its
  mask), so a view measured that way never scrolled. It now measures the content without the clip.

## 0.5.10

### Added

- **LDtk import**: `parseLdtk` reads a project's levels into the same `TileMap` Tiled maps use, so `TilemapView`,
  `collisionFromTiled` and `objectsOf` work on them: IntGrid, AutoLayer, Tiles and Entities layers, entity and level
  fields, tile custom data and enum tags, world layouts, multi-worlds projects and separate `.ldtkl` level files.
  `levelByName`, `levelAt`, `entitiesOf`, `intGridAt`, `ldtkExternalLevels`, `loadLdtkLevel`;
  `AssetLoader.ldtk(key, url, { levels })` and `ldtkProject(key)`; `collisionFromIntGrid(grid, solid)`.
- **Autotiling**: `autotile`, `updateAutotile` and `paintTerrain` on 4-bit edge masks or 47-tile blob masks
  (`edgeMask`, `blobMask`, `BLOB47_MASKS`, `blob47Index`), with stable variants, fallbacks and `connectsTo`; an edit
  retiles only its 3x3 neighbourhood. `TilemapView.refreshTiles(layer, cells)` repaints only the chunks touched, and
  `x`/`y` place a map at a world position. The `ldtk` example.
- **Ambient life**: `Drift` (leaves, seeds, embers, motes, ash), `Birds`, `Butterflies`, `Fireflies` and
  `ChimneySmoke`, bounded pools that live only in view on whole pixels, spawned from a `LifeSource` callback
  (`sourceOf`, `pickInView`) under a `LifeAir`; `paintLifeArt` in `1681-engine/pixel` paints their art.
- `Haptics` and `HapticGate`: a per-kind rate-limited buzz with an injectable player (`navigator.vibrate` by default).
- `ApiClient` and `ApiError`: a JSON REST client with a timeout, a bearer token, a 401 refreshed once and retried,
  status and error hooks, and abort.
- `Prepainter` and `workerPainter`: big textures painted ahead in a worker for the neighbours of the current key, the
  rest freed.
- React kit: `ConfirmButton` (a button asked twice), `useJsonSelector`, `useStoreJson`, the optional label
  `confirmAgain`.
- **`1681-engine/updates`**: the pure half of file-by-file web updates from a release store, shared by desktop,
  browser and phone builds — `LatestJson`/`WebManifest`/`WebFile`, `validManifest`, `planWeb`, `pickWebUpdate`,
  `apkUpdateOf`, `pluginEntries`, `heldBundle`.
- **`1681-engine/electron`**, the main-process side of an Electron build: `WebPatcher` (each newer web built beside the
  running one, checked by sha256, only for the same shell; one that never boots is dropped for the last good one),
  `shellId`, `SessionStore`/`registerSessionStore` (an OS-encrypted `safeStorage` secret, refused under `basic_text`),
  `lockDownWindow`, `denyPermissions`, `refuseDebugLaunch` and the pure link rules. Both subpaths ship as ES modules
  and CommonJS (`dist/cjs`); `electron` is an optional peer dependency that nothing imports.
- **Browser tests** (`npm run test:browser`, Vitest browser mode on headless Chromium with SwiftShader): WebGL pixels
  read back, canvas text, `FontFace`, `decodeAudioData`, TexturePacker atlases, silhouettes, `RichText`, `PixelLayer`,
  `PixelMarks`, `Darkness`, the React `Panel`'s fitting, fullscreen and pointer lock, `Engine.create` and
  `DrawCallCounter`, in a CI job of their own; `npm run check` stays node-only.
- Guide page "Desktop: patching, sessions, lockdown"; the tilemap page covers LDtk and autotiling.

### Fixed

- `AssetLoader` names the URL when an image, sprite sheet or atlas page cannot be decoded, and the family and URL when
  a font cannot be loaded; the browser's bare message named neither.

## 0.5.9

### Added

- **Platform helpers**: `enterFullscreen`/`exitFullscreen`/`toggleFullscreen`/`isFullscreen`/`fullscreenSupported`/
  `onFullscreenChange` (with webkit fallbacks), `lockOrientation`/`unlockOrientation`/`currentOrientationKind`,
  `prefersReducedMotion`/`onReducedMotionChange`/`followReducedMotion`, `requestPointerLock`/`exitPointerLock`/
  `isPointerLocked`/`onPointerLockChange`, `onAppResume` and `timeoutSignal` (an `AbortSignal.timeout` stand-in for
  older iOS); each does nothing safely where unsupported.
- `Engine.create({ pauseWhenHidden, followReducedMotion })` (both off by default): pause while the page is hidden with
  no catch-up steps on return, and copy the system's reduced-motion setting into `engineSettings.reducedFx`.
  `HiddenPause` holds the rule on its own.
- **Gamepad rumble**: `rumble`, `rumblePad`, `stopRumble`, `rumbleParams` and `Actions.rumble`. `Pointer` gains
  `lock`, `unlock`, `locked` and `takeMovement` for mouse-look.
- **`AssetLoader`** loads `atlas` (TexturePacker/Pixi JSON, hash or array, multipack, trimmed and rotated frames;
  `getAtlas`), `font` (a `FontFace` into `document.fonts`) and `audio` (`getAudio`/`decodeAudio`, decoded through the
  sound context or kept until one exists). `parseAtlas`, `collectAtlasPages`, `duplicateFrames`,
  `TextureRegistry.addAtlas`, `CanvasTexture.addPacked`, `SoundEngine.audioContext`.
- **`RichText`** (`1681-engine/ui`): inline markup for colour, bold, italic, size and icons, wrapped and aligned, on
  canvas or bitmap fonts; the pure `parseRichText`, `escapeRichText`, `stripRichText` and `layoutRichText`.
- **Hit flashes and dash ghosts without a filter pass**: `solidSilhouette`, `fillSolid`, `clearSilhouettes` and pooled
  `Afterimages`.
- **Pixel-art zoom maths**: `worldZoom`, `baseZoom`, `zoomSteps`, `zoomResolution`, `fitScale` (whole steps and an
  optional half step with the resolution that keeps a world pixel whole).
- `blendLayer`: one container per stage for additive sprites, so they do not split batches.
- In `1681-engine/pixel`: `spark`, `tail`, `pixelOn`; `PixelMarks` and `aimPixels` (chevron aim lines and lock rings
  in world pixels).
- `Connection`: `fatalCloseCodes` (close codes that never reconnect) and `resumeProbeMs` (a socket that does not answer
  a ping after the app returns from the background is dropped with `CLOSE_NO_ANSWER` and reconnected);
  `reconnectDelay` and `shouldReconnect`.
- Guide pages: assets, platform, ECS, rig, tilemaps, audio, rich text, netcode.

### Changed

- Movement numbers no longer need a fork: `MovementParams` takes `dashFlag` and `stepDt` (defaults `INPUT_FLAG_DASH`,
  1/60 s); the tile size and body half extents were already the grid's. `TILE_SIZE`, `BODY_HALF_*` and
  `INPUT_FLAG_DASH` are kept as the defaults.
- `Darkness` takes `{ carriedLight }` (default `CARRIED_LIGHT`, 80) and `update()`'s radius defaults to it; the pixel
  module no longer imports `net/`.
- `Clock` runs timers without allocating a frame; a timer that throws is reported to `Clock.onError` and dropped.
- `DrawCallCounter` counts `drawRangeElements` and leaves a later wrapper in place when it uninstalls.
- A socket replaced by a newer one no longer emits a stale `close`.
- The package ships no source maps (`ENGINE_SOURCEMAP=1` builds them; they pointed at an unpublished `src/`) and no
  longer declares `engines.node`; `Room`, `RoomHost` and `LobbyHost` on a server need Node 22 or later. The tarball went
  from 931 kB to about 420 kB.
- Typechecks against pixi.js 8.6, the peer floor, tested in CI along with the examples build. Workflows use v5 actions;
  publishing pins npm 11 and uses no cache.

### Tests

- Golden bytes for the snapshot codec, cadence, `LobbyRooms`, `Connection`, the platform helpers, sparse sets, field
  columns, sticks, long press, eases, synth, view culling, touch detection, the spatial hash and transient lights.

## 0.5.8

### Added

- **Bodies that turn**: `PhysicsWorld` bodies made with `rotates: true` have an `angle`, an `angularVelocity`, a moment
  of inertia from their shape and are turned by contacts (each with one or two contact points: `ContactInfo.points`),
  `applyImpulse`/`applyForce` at a point, `applyTorque`, `applyAngularImpulse`; `angularDamping`, `setAngle`,
  `velocityAt`, `toWorld`/`toLocal`. Convex **polygons** (`polygonShape`, `polygonCentroid`, `regularPolygon`, up to 16
  corners) and boxes at an angle collide by the separating axis test with clipped edges; turning bodies never push out
  of a merged tile box's internal face, so seams stay snag-free. Kinematic spinners, rolling balls, raycasts against
  turned shapes, sleep that counts spin. `syncToBody` turns a view with its body. Bodies that do not rotate behave
  exactly as before.
- **`1681-engine/postfx`**: `PostFx` lays a chain of full-screen filters over the whole picture or the world layer,
  switched one by one, with `flash`, `shockwave` and `animate` for effects that come and go (skipped under reduced
  effects); `BloomFilter`, `VignetteFilter`, `ColorAdjustFilter`, `ChromaticAberrationFilter`, `CrtFilter`,
  `PixelateFilter`, `ShockwaveFilter`; `FxFilter` builds an effect from one spec in GLSL and WGSL with shared helpers.
- **Lobby and matchmaking**: `LobbyHost` (transport-free like `RoomHost`): rooms with a host, a share code, private
  rooms, ready flags, kick and promote, chat, the game's settings, a room starting its own game; a queue per mode
  filled by `Matchmaker` (pure: rating windows widening with the wait, both sides' windows respected, parties never
  split, teams balanced by `balanceTeams`); ready checks with a deadline, decline lockouts and requeueing at the old
  place; `onStart` hands each player where to go, `finish` opens the rooms again; message rate limits. `LobbyClient`
  keeps the state for a lobby screen over a `Connection`.
- React kit: `UiProvider classNames` hangs a game's own class names beside the kit's (`{ tabs: 'tabs', button: 'btn',
  picked: 'active' }`), states included, so a game whose stylesheet already styles its own names takes the kit without
  rewriting it; `useCx` / `UiSettings.cx` join them, `classJoiner` is the pure rule.
- `DebugOverlay`'s `colliders` callback also gets a line drawer, and `drawColliders` draws turned shapes as outlines.
- Examples: `physics-toys` (turning bodies under every post effect) and `lobby` (a React lobby screen, a server with
  bots). Guide pages: post-processing, lobby and matchmaking; the physics page covers turning bodies.

## 0.5.7

### Added

- **Aseprite import**: `parseAseprite` reads Aseprite's sprite-sheet JSON (hash or array frames) into `Animator`
  clips, one per tag, with every tag direction and repeat count, per-frame durations, trimmed frames, slices with their
  9-slice centre and pivot (`sliceAt`, `sliceBorders`), layers, and cel user data as frame markers (`clipMarkers`);
  `loadAseprite` / `addAsepriteTextures` register the sheet's frames as textures.
- **`AnimStateMachine`** drives an `Animator` from named states: transitions on bool, number and trigger parameters,
  clip-end and exit-time transitions, any-state transitions by priority, events on frame markers (a footstep on
  frame 3), no allocation per update; `AnimStateComponent` and `animStateSystem` run it in the ECS.
- **`Timeline`**: sequenced and overlapping tweens and calls with positions (`'<'`, `'+=200'`, labels), `parallel`
  groups, nesting, repeat/yoyo/repeatDelay, timeScale, pause/seek/reverse/restart, `finished`; made with
  `stage.tweens.timeline()` or stepped by hand. `Tweener` gains `run(steppable)` and `timeline()`.
- **`Parallax` / `ParallaxLayer`**: scenery that scrolls at a share of the camera's travel on x and y, tiled textures
  repeating forever (covering only the view), offset and drift, whole-pixel snapping on pixel-perfect engines,
  culling and depth; works with the camera's zoom.
- Examples: `aseprite` (a generated sheet, the state machine and its events); the platformer's hills are a
  `Parallax` and reaching the goal plays a `Timeline`.
- Documentation: a guide page for every module (input, animation, physics, navigation, particles, game feel, ambient,
  tweens and parallax, transitions, UI, React kit, localisation, saves, diagnostics and debug); the API reference
  covers `1681-engine/ui` and `1681-engine/react`.

### Fixed

- The docs build no longer fails on `{{` quoted in inline code of the API reference.

## 0.5.6

### Added

- **React kit** (`1681-engine/react`, React 19 as an optional peer dependency): `Panel` (a window fitted into the
  screen by `fitToViewport`, its body scrolling; a full-screen sheet on touch), `TabStrip` (wraps with `wrap`),
  `SplitPane` with `usePicked` and `useFillSheet` (list beside detail, one pane at a time on a narrow touch screen),
  `Select` (a drop-down whose list opens in a portal as wide as its longest label, placed by `listWidth` and
  `placeTooltip`), `Tooltip` and `TitleTips` (every `title=` drawn as the kit's tooltip, flipped at the edges, desktop
  only), `Modal`, `ConfirmDialog` / `askConfirm` / `askQuantity`, `ChoiceDialog` / `askChoice`, `Slider`, `PixelImage`
  (sprites at whole multiples), `Glyph` (pixel marks a pixel font lacks, `registerGlyph`), `UiProvider` (touch mode,
  window scale, viewport, portal, labels) and `useStore` over `createStore`. Themed by CSS custom properties
  (`--e1681-*`, frames as 9-slice `border-image`s) in `baseCss` / `injectBaseCss()`; every word is a prop or a label
  with an English default. Pure placement helpers (`windowStyle`, `cursorTip`, `listPlacement`, `pixelFit`,
  `splitModeFor`) are exported and tested under node.
- `Scene.delay(ms, fn)`: timers owned by the scene, cancelled when it exits (`stage.time.delayedCall` timers belong to
  the stage and fire after the scene has gone). `Scene.useInput(actions)` registers input to flush when a scene pushed
  over this one pops.
- `Actions.flush()` drops pending press and release edges; held keys stay held but are not pressed again.
- Key chords in bindings: `Shift+Tab`, `Ctrl+KeyS` (`Shift`, `Ctrl`, `Alt`, `Meta`, either side). A held chord keeps
  the bare key's action off until that key comes up. `parseChord`, `chordHeld`; `keyLabel` reads a chord.
- `Keymap` takes `fixed` inputs per action (gamepad, touch, a reserved key such as Escape for pause), laid after the
  player's keys by `applyTo` and never saved; `fixedFor(action)`.
- `Camera.clearBounds()`, `Camera.reset()` (no target, no bounds, `defaultZoom`, scroll 0, no shake or flash),
  `Camera.defaultZoom` (set from the engine's `zoom`), `tracking` and `boundsRect`.
- `PhysicsWorld.bodies` (read-only), and `drawColliders(world, draw, colors?, colorOf?)` for `DebugOverlay`'s
  `colliders` callback.
- `parent` options: `FloatingText` (labels under a scene's `root`) and `UiRoot` (under a scene's `hud`, destroyed
  with it). `ColorGrade` takes `parent` and `placement: 'bottom'`, which keeps it under every HUD whatever the order
  they were made in.
- `ColourSkin.fillAlpha` and `borderAlpha`: a bare ring is `fillAlpha: 0`.
- `Dialog` without a `height` takes its content's, padding included, measured again on every layout.
- `installLabelFont`, `BitmapLabel`, `Label.bitmap`, `ObjectFactory.label` and `FloatingText` take `glyphs` a font
  bakes besides ASCII.

### Changed

- `SceneManager.replace` resets the shared camera between the old scenes leaving and the new one entering, so a
  level's follow target and bounds no longer hold over the next scene. `push` and `pop` leave it alone; `pop` flushes
  the resumed scene's registered input before `onResume`.
- `Keymap.applyTo` accepts an `Actions` with more actions than the keymap's and binds only the keymap's.
- A `ColourSkin` border is drawn as four strips round its fill rather than a box under it, so a see-through fill no
  longer shows the border colour through it (opaque skins look the same).
- `Button` centres its content again when the content (a `Label` given new text) changes size; widgets tell their
  parent through `Widget.childResized`.
- Documented: `Scene`'s `world`/`root`/`hud` and Pixi's `Container.label` are taken names for subclass fields; a
  `Keyboard` knows only keys pressed after it was made; bitmap label fonts bake ASCII unless given more; the save
  envelope keeps its `'lantern-save'` tag so existing saves still load.

### Fixed

- `DebugOverlay` prevents its toggle key's browser action (F3 opened find-in-page).
- `Slider` draws its focus face under the knob, not over it.

## 0.5.5

### Changed

- **Renamed to 1681 Engine**: the package is `1681-engine` (`1681-engine/pixel`, `1681-engine/ui`) and the repository
  `Phadec/1681-engine`. The pixel module keeps its name, Dither.
- `World.entities()` and `World.componentsOf(e)` list live entities and what they hold, for tools.

### Added

- **UI** (`1681-engine/ui`): canvas widgets on the stage's screen layer (`UiRoot`, `Panel` 9-slice or colour box,
  `Button`, `Label`, `Bar` with a delayed drain, `Slider`, `Toggle`, `Stack`, `ScrollView`, `List`, modal `Dialog`),
  keyboard and gamepad focus through `Actions`, screen anchoring that follows resizes, whole-pixel layout, presses on
  widgets kept from the world (`UiPointerGate`); a DOM/React bridge (`DomOverlay`, `DomWorldAnchors`, `createStore`,
  `InputShield`); pure layout maths shared by both (`stackLayout`, `anchorPosition`, `fitToViewport`,
  `placeTooltip`, `wrapRow`, `listWidth`, scrolling, focus navigation).
- **Physics**: `PhysicsWorld`, rigid circles and axis-aligned boxes (dynamic, static, kinematic) with restitution,
  friction, damping, gravity scale, sensors and layers; a grid broad phase, warm-started impulses, sub-steps against
  tunnelling, optional sleeping; contact events, `grounded`, `raycast`, a `preSolve` hook; `tileBodies` merges a tile
  grid into static boxes; `syncToBody` draws a view between steps. Not deterministic across machines.
- **Particles**: `Emitter` (bursts and rates, spread, gravity, drag, size/alpha/tint over life, normal or additive) on
  one pooled `ParticleContainer`, a shared `ParticleBudget` that thins under `reducedFx`/`batterySaver`, culled off
  screen; pure `ParticleSim` and curves.
- **Navigation**: A* `findPath` on any tile grid or `CollisionGrid` (reach radius, extra cost, end-only tiles, no
  corner cutting), `straightenPath`, `simplifyPath`, `floodFill`, `nearestOpen`, `MinHeap`.
- **Saves**: `SaveStore` (versioned slots over a pluggable `SaveBackend`, a migration chain, a checksum, the last good
  copy kept), `Autosaver`.
- **Scene transitions**: `transitionTo(engine, next, transition, mode)` with `FadeTransition`,
  `CrossfadeTransition`, `DitherWipeTransition`; `Letterbox`.
- **Localisation**: `Translator` (English source as key, `|context`, plurals, missing-key callback, runtime switching),
  `extractStrings`.
- **Ambient**: `DayClock`, deterministic `weatherAt`, `WeatherLayer`, `ColorGrade`; pixel `NightShade`,
  `paintWeatherArt`, `SwayProp` (sprites swaying by whole pixels), `DitherVignette`, `nineSlice`/`frameSvg` UI frames.
- **Input**: `Keymap` (rebinding, reserved keys, saved sets), `AimGesture` (drag-to-aim), `TargetLock`.
- **Diagnostics and debug**: `watchContextLoss`, `guardRender`, `bootWatch`, `maxTextureSize`, `FrameSampler`,
  `captureErrors`; `DebugOverlay` (FPS graph, draw calls, entities, collision boxes, the last errors).
- **`FloatingText`**: pooled bitmap labels for damage numbers and pickups, fonts baked ahead.

## 0.5.3

### Added

- Music in layers: `music.channel(name)` plays one looping track per channel (a score and an ambience under it),
  each crossfaded on its own at its own level; `music.play` is the `'music'` channel. `music.configure({ route,
  pauseInBackground })`: the `<audio>` element's own volume by default, a Web Audio gain only where that volume is
  read-only (iOS) or when asked, and the music stopped while the page is hidden. `MusicChannel`, `elementVolumeLocked`.
- `paintLayer(stage, { at, duration, paint, depth, alive, every, fps, onCreate })` in `1681-engine/pixel`: one
  effect as its own pixel layer redrawn at 12 fps, following its anchor, dithered away at the end and skipped off
  screen.
- `Footsteps`: steps and hooves by the surface under the feet, the surface named by the game (`setSurfaceAt`).
- `detectTouch` and `TouchEnv` are exported; `setTouchOverrideKey` names the `localStorage` key that forces touch.

### Changed

- `MusicOptions` is now the player's configuration; a track's options are `MusicPlayOptions`.
- Music plays on the element's own volume where it works, instead of always through Web Audio: a file from another
  origin no longer plays silent there.

## 0.5.2

### Added

- `registerMaterial(name, { light, factors })`: a game adds its own materials to the hue-shifted ramps, or changes a
  built-in one. `Material` is the built-in set (`BuiltinMaterial`) or any registered name; `MATERIALS` and
  `RAMP_FACTOR_SET` (now exported) include what is registered.
- `registerHandRamps(…)`: ramps picked by hand for a game's own effect colours.
- `1681-engine/pixel/tone` and `1681-engine/pixel/paint`: the pixel shapes and the colour/dither helpers as
  named exports (`pixelPaint` and `pixelTone` remain namespaces of `1681-engine/pixel`).
- `selectiveOutline(g, width, dark)` and `groundShadow(g, cx, cy, rx, ry, core, rim)` take their colours.
- A test that fails on a game's names or language anywhere in the engine, and "The engine knows no game" in the
  architecture guide.

### Changed

- `pixelTone.ramp` has no hand-picked ramps built in any more (they were one game's effect colours): every colour is
  `derivedRamp` until a game registers its own.

## 0.5.1

### Changed

- The library ships one file per source module (`dist/core/Stage.js`, `dist/pixel/pixel.js`…) behind the same two
  entry points, and declares no side effects, so a game's bundler keeps only what it imports: a web worker that wants
  the colour helpers no longer takes Pixi, the audio engine and every other module with it.

## 0.5.0

### Fixed

- The bundled audio worker (`takeCleanerWorker`) is found again by a game's own bundler: 0.4.0 wrote its URL as an
  absolute `/assets/…`, so Vite failed to build any game importing the engine (`Could not resolve entry module`). The
  library is now built with a relative base and the worker sits beside the module that loads it.

## 0.4.0

### Changed

- Node 22 or later (Node 20 reached its end of life; Pixi reads `navigator`, which Node 20 lacks, as it loads).

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

The engine is now **1681 Engine** (`1681-engine`), for 2D games in any art style; the pixel-art tools moved to
their own module, **Dither** (`1681-engine/pixel`).

### Breaking

- Pixel-art exports moved to `1681-engine/pixel`: `PixelLayer`, `pixelPaint`, `pixelTone`, the colour and pixel-grid
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
