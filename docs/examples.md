# Examples

Each example is one file of game code over the engine. They run here in the browser; on your machine run
`npm run dev` in the repository and open http://127.0.0.1:5180/. The source of each is `examples/<name>/main.ts`.

## top-down

A Tiled map loaded with its tileset, collision from the tiles' `solid` property, an animated hero, input actions on
keyboard, gamepad and touch, and a camera that follows softly. The map opens in Tiled for editing.

[Run top-down ↗](./examples/top-down/index.html){target="_blank"}

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
