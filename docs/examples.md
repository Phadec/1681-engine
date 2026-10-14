# Examples

Each example is one file of game code over the engine. They run here in the browser; on your machine run
`npm run dev` in the repository and open http://127.0.0.1:5180/. The source of each is `examples/<name>/main.ts`.

## top-down

A Tiled map loaded with its tileset, collision from the tiles' `solid` property, an animated hero, input actions on
keyboard, gamepad and touch, and a camera that follows softly. The map opens in Tiled for editing.

[Run top-down ↗](./examples/top-down/index.html){target="_blank"}

## ldtk

An LDtk project whose two rooms are saved in their own level files, laid side by side by its linear world layout: the
IntGrid "Walls" layer is the collision and, through its auto-layer tiles, the look; the chests' fields show as you walk
by. Click a cell to raise or dig out a wall: the cell and its neighbours are autotiled again with 47-tile blob rules
and only the chunks touched are repainted. The assets are written by `make-assets.ts`.

[Run ldtk ↗](./examples/ldtk/index.html){target="_blank"}

## dialogue

A playground for dialogue scripts, for writers rather than players: edit the JSON on the left and see what
`validateDialogue` finds as you type; play it through on the right with its variables in view and editable, the
commands it runs logged, and any node a click away. Open and save scripts as files; the one in the box is kept in
the browser between visits. No canvas: plain DOM over `DialogueRunner`.

[Run dialogue ↗](./examples/dialogue/index.html){target="_blank"}

## platformer

A small side-scrolling platformer, the engine's newer modules working together with every sprite painted in code: a
`PhysicsWorld` built from a hand-written tile grid by `tileBodies` (crates to push, a kinematic moving platform,
one-way planks through `preSolve`, sensor coins and a goal flag), a hero with coyote time, jump buffering and a
variable jump height, dust and coin sparkles from `Emitter`s and a floating "+1", a canvas HUD and a pause `Dialog`
(resume, restart, language, a volume `Slider`, a "press a key" rebind for Jump) driven by mouse, keyboard or gamepad,
best time and coins kept by a `SaveStore` with a v1→v2 migration (open it with `?v1` to watch it run), dithered and
faded scene transitions, English and French through a `Translator`, a `DayClock` sky with a `ColorGrade`, and
`DebugOverlay` on F3 drawing every body.

[Run platformer ↗](./examples/platformer/index.html){target="_blank"}

## physics-toys

Bodies that turn: crates tumble down a ramp, balls roll, hexagons and triangles stack, and a kinematic bar spins in the
middle and bats them away. Click to drop a shape, Space to blast everything away from the pointer with a shockwave
and a flash. Over it, `PostFx`: bloom and a vignette on, chromatic aberration, CRT and pixelate a number key away.

[Run physics-toys ↗](./examples/physics-toys/index.html){target="_blank"}

## lobby

A lobby screen built from the React kit over `LobbyClient`: browse and create rooms, share a private room's code,
ready up, chat, queue alone or as a room, and accept a found match before its clock runs out. It needs its server
(`npm run example:lobby` in the repository, then `npm run dev`), which keeps five bots queueing so one tab sees a
match made; the site lists it but does not host it.

## aseprite

An Aseprite export read by `parseAseprite`: its tags become clips, the cel data on an "events" layer becomes frame
markers, a slice's pivot stands the sprite on its feet. An `AnimStateMachine` moves the figure between idle, run, jump,
fall and land from parameters the movement sets each step, and the footsteps and the landing's thud are the artist's
markers, listed under the canvas as they fire. The sheet and its JSON are made in code (`sheet.ts`), so the example
ships no image.

[Run aseprite ↗](./examples/aseprite/index.html){target="_blank"}

## night-garden

The core with smooth vector art and no pixel module: a rigged character animated by blended poses (walk, run with
Shift, roll with Space), a lantern that follows it through the dark, drifting fireflies, a soft camera.

[Run night-garden ↗](./examples/night-garden/index.html){target="_blank"}

## pixel-dungeon

The pixel module: a dungeon lit by torches whose light falls off in dithered steps, a light the hero carries, sword
arcs drawn with `pixelPaint`, and slimes that evaporate into their own pixels when struck.

[Run pixel-dungeon ↗](./examples/pixel-dungeon/index.html){target="_blank"}

## ecs-stress

Tens of thousands of bodies moved by typed-array components through cached slot lists, drawn with a Pixi
`ParticleContainer`. The HUD shows the frame rate and the simulation step's time; add bodies and see where the time
goes (drawing, not the ECS).

[Run ecs-stress ↗](./examples/ecs-stress/index.html){target="_blank"}

## walk-room

The smallest whole game: one scene, three components, three systems, a pixel ring round a box that walks and rolls.

[Run walk-room ↗](./examples/walk-room/index.html){target="_blank"}

## multiplayer

Two or more players in one courtyard through an authoritative server: prediction for your own body,
reconciliation on every snapshot, interpolation for everyone else, and the round trip and correction count on screen.
It needs its server, so it runs on your machine only:

```sh
npm run example:server   # ws://127.0.0.1:5181
npm run dev              # then open examples/multiplayer/ in two tabs
```
