---
layout: home

hero:
  name: 1681 Engine
  text: 2D games for the web, any art style
  tagline: Scenes, a fast ECS, Tiled maps, input on every device, rigged characters, light and music, and multiplayer that a server can replay bit for bit. Built on PixiJS 8, in TypeScript. Pixel art gets a module of its own.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: See the examples
      link: /examples
    - theme: alt
      text: API reference
      link: /api/

features:
  - title: Scenes and a fast ECS
    details: A stack of scenes with async loading, a fixed-step simulation, and an entity–component–system on sparse sets with typed-array columns — a step over 50,000 bodies in a tenth of a millisecond.
  - title: Tiled maps and assets
    details: Load images, sprite sheets and Tiled maps with progress; maps draw in culled chunks and give you their collision from a layer or a tile property.
  - title: Input on every device
    details: Named actions bound to keys, gamepad buttons and sticks, and touch buttons, with per-step edges and analog values. Players can rebind.
  - title: Rigged characters
    details: A 2D skeleton drawn from cut-out images or vector shapes, with blended poses and a built-in humanoid of 72 poses and ready clips.
  - title: Light, sound and music
    details: Soft lights cut out of the dark, a Web Audio sound engine with distance muffling, and music that streams and crossfades — iOS included.
  - title: Multiplayer that agrees
    details: An authoritative room for Node, client prediction and reconciliation over deterministic movement, interpolation for everyone else. In tests and over real sockets the server never has to correct a prediction.
  - title: Pixel art, as a module
    details: 1681-engine/pixel adds pixel-perfect effects on the world's own grid, dithered lighting and bodies that evaporate into their own pixels. Games that don't use it don't ship it.
  - title: Made for a real game
    details: Grown out of a shipped online action RPG; its rules come from profiling it on phones. Strict TypeScript, tested, MIT.
---
