# Animation

Frame animation in 1681 Engine has three layers, each usable without the next:

- `Animator`: one clip at a time, advanced by time, frame indices or names, fps or per-frame durations.
- `parseAseprite` / `loadAseprite`: an Aseprite export read into clips, textures, slices, layers and frame cues.
- `AnimStateMachine`: named states over an `Animator`, moved between by parameters, with frame markers as events.

The finished example is [`examples/aseprite/`](/examples#aseprite).

## Importing from Aseprite

In Aseprite, **File → Export Sprite Sheet**: on the *Output* tab tick *JSON Data* (either *Hash* or *Array*), and
under it *Tags*, *Slices* and *Layers* as you need them. Keep the sheet's image beside the JSON.

```ts
import { Animator, loadAseprite } from '1681-engine';

class Level extends Scene {
  override async onEnter() {
    const { stage } = this.engine;
    const hero = await loadAseprite(stage.textures, 'hero', 'art/hero.json'); // then art/hero.png, as the JSON names it
    const sprite = stage.add.image(64, 64, 'hero', 0);
    this.root.addChild(sprite);
    const anim = new Animator(hero.clips, 'idle'); // one clip per tag, named as the tag
  }
}
```

`loadAseprite` takes the same `baseUrl`, `fetch` and `toCanvas` options as `AssetLoader`; run it beside an
`AssetLoader` with `Promise.all([loadAseprite(…), assets.load()])`. The texture's frames are named by the sheet frame's
index (`'0'`, `'1'`…), which is what the clips list. When you already hold the JSON and the image (a worker made them,
or you packed them yourself), parse and register them apart:

```ts
import { addAsepriteTextures, parseAseprite } from '1681-engine';

const sheet = parseAseprite(json); // pure: runs under node and in a worker
addAsepriteTextures(stage.textures, 'hero', canvas, sheet);
```

### What a tag becomes

A tag's clip lists every frame it shows, in order, with each frame's own duration from Aseprite, so the engine's
`Animator` (which plays a list forward) shows what Aseprite's preview shows:

| Tag | Repeat | Clip frames | Loops |
|---|---|---|---|
| forward, 0–3 | — | 0 1 2 3 | yes |
| reverse, 0–3 | — | 3 2 1 0 | yes |
| pingpong, 0–3 | — | 0 1 2 3 2 1 (the turns are not doubled) | yes |
| pingpong_reverse, 0–3 | — | 3 2 1 0 1 2 | yes |
| forward, 0–2 | 2 | 0 1 2 0 1 2 | no: holds the last frame, `finished` |
| pingpong, 0–2 | 2 | 0 1 2 1 0 (each pass one way counts once) | no |

A sheet with no tags still has `sheet.all`, every frame in order, looping. Two tags of one name become `name` and
`name#2`. A trimmed frame keeps its untrimmed size and offset, so a sprite anchored at its feet stays put as the trim
changes. Rotated frames (which Aseprite never writes) are refused.

### Slices: 9-slice and pivot

A slice is keyed per frame; `sliceAt` gives the key in effect on a frame, `sliceBorders` its 9-slice borders in the
shape Pixi's `NineSliceSprite` takes, and the pivot is where you anchor a sprite.

```ts
import { sliceAt, sliceBorders, sliceNamed } from '1681-engine';

const feet = sliceAt(sliceNamed(sheet, 'feet')!, 0)?.pivot;
if (feet) sprite.setOrigin(feet.x / sheet.frames[0]!.sourceW, feet.y / sheet.frames[0]!.sourceH);

const panel = sliceAt(sliceNamed(sheet, 'panel')!)!;
const borders = sliceBorders(panel); // { left, top, right, bottom } or undefined with no centre
```

### Layers and frame cues

`sheet.layers` lists the layers (name, group, opacity, blend mode, colour, user data). Where the export includes cels
with user data, they are `sheet.cues`: this is how an artist marks frames in Aseprite itself. Make a hidden layer
(say `events`), put a cel on the frames that matter and write its user data (*Cel Properties → User Data*): `step`,
`hit`, `thud`. `clipMarkers(sheet, 'events')` turns them into markers per clip, at each position a clip shows such a
frame (a ping-pong shows a frame twice a round trip, so it fires twice).

## The state machine

```ts
import { AnimStateMachine, clipMarkers } from '1681-engine';

const markers = clipMarkers(sheet, 'events');
const sm = new AnimStateMachine(sheet.clips, {
  initial: 'idle',
  params: { speed: 0, grounded: true, vy: 0, jump: 'trigger', hurt: 'trigger' },
  states: {
    idle: { clip: 'idle' },
    run: { clip: 'run', speedParam: 'speed', markers: markers.run }, // cadence follows the body's speed
    jump: { clip: 'jump', markers: [{ frame: 0, name: 'whoosh' }] },
    fall: { clip: 'fall' },
    land: { clip: 'land', markers: markers.land },
    hurt: { clip: 'hurt' },
  },
  transitions: [
    { from: '*', to: 'hurt', when: { hurt: true }, priority: 20 },
    { from: '*', to: 'jump', when: { jump: true }, priority: 10 },
    { from: 'idle', to: 'run', when: { speed: ['>', 0.1] } },
    { from: 'run', to: 'idle', when: { speed: ['<=', 0.1] } },
    { from: 'jump', to: 'fall', when: { vy: ['>', 0] } },
    { from: ['jump', 'fall'], to: 'land', when: { grounded: true } },
    { from: 'land', to: 'idle', onEnd: true },
    { from: 'hurt', to: 'idle', exitTime: 1 },
  ],
});
sm.onEvent = (event, state, frame) => {
  if (event === 'step') sound.play('step');
};
```

Each step (or frame) the game sets the parameters, and the machine does the rest:

```ts
sm.set('speed', Math.abs(body.vx) / runSpeed).set('grounded', body.grounded).set('vy', body.vy);
if (jumped) sm.trigger('jump');
sm.update(dt); // seconds
sprite.setFrame(sm.frame);
```

- **Parameters** are declared by their starting value: a boolean, a number, or `'trigger'`, a one-shot flag.
- **Conditions** (`when`) name parameters: a value to equal (`grounded: true`, `stance: 2`), `[op, number]` to compare
  a number (`'==' '!=' '>' '>=' '<' '<='`), or `true` / `false` for a trigger. All must hold.
- **`onEnd`** waits until the clip has played through once (a non-looping one has finished); **`exitTime`** until
  that share of it has played (`0.5` is half way, `2` two loops).
- **`from: '*'`** is an any-state transition. Transitions are tried by `priority`, highest first, ties in the order
  written. An any-state transition never re-enters the state it is in unless it says `self: true`.
- **Triggers** a taken transition names are used up. A trigger nothing used is dropped at the end of the update, so a
  jump pressed in mid-air does not play out on landing; `keepTriggers: true` keeps them until used.
- **One transition per update**, after the clip has advanced, so a chain takes one update per link and every state
  is seen. `update(0)` checks the transitions without moving the clip; `play(state)` goes there at once.
- **Markers** fire as playback reaches their frame, frames skipped by a long step included, and a marker on frame 0
  fires on entering the state. A listener may change state; the old clip's later markers then do not fire.

The definition is compiled into typed arrays once, so `update` allocates nothing, and the machine is pure: test it
under node with a fake clock by calling `update` with fixed steps.

### With the ECS

Give an entity `AnimStateComponent` instead of `AnimationComponent` (the machine owns its animator), and add
`animStateSystem()` after the systems that set its parameters:

```ts
import { AnimStateComponent, SpriteComponent, animStateSystem } from '1681-engine';

this.world.spawn([SpriteComponent, sprite], [AnimStateComponent, sm]);
this.world.addSystem(animStateSystem());
```
