# Skeleton rig

A rig draws a character from bone angles instead of frames. A **pose** (`RigPose`) is a small object of limb angles
and offsets; a **`Skeleton`** solves it into joint positions on the rig's grid; a **`RigView`** places a part (an
image or a vector shape) on every bone; and a **`PosePlayer`** plays clips of key poses over time, blending between
them, so a handful of keys makes a smooth motion. The engine ships one rig, a 20×24 humanoid facing right
(`HUMANOID_RIG`), with 72 poses (`HUMANOID_POSES`) and ready-made clips (`HUMANOID_CLIPS`). Everything but `RigView`
is pure and runs under node. The finished example is [`examples/night-garden`](/examples#night-garden).

## Poses and the skeleton

A limb is four numbers, `[upper angle, upper length, lower angle relative to the upper, lower length]`: angles in
degrees in the sprite space of a character facing right (0 = forward, 90 = straight down), lengths in grid pixels.

```ts
import { Skeleton, HUMANOID_RIG, type RigPose } from '1681-engine';

const reach: RigPose = {
  by: 1, // the chest sits a pixel lower (negative rises)
  armF: [10, 2.4, -20, 2], // the front arm forward, the elbow bent up
  armB: [100, 2, 10, 1.5],
  legF: [80, 2, 20, 2],
  legB: [110, 2, -10, 2],
};

const joints = new Skeleton(HUMANOID_RIG).solve(reach);
joints.wristF; // { x, y } in grid px of the 20×24 frame
joints.forearm; // radians: the line a held weapon follows
```

Every field of a pose is optional. A limb left out hangs straight down (`solve`), and a field left out of a pose laid
over another is taken from the one under it (below). Besides the limbs, `RigPose` has `hipDx`/`hipDy` (both hips),
`headDx`/`headDy`, `curl` (the torso as a ball centred there, for a tumble) and fields a richer renderer can read:
`face`, `lookBack`, `trail`, `breathe`, `sway`, `armBFront` and `smearArm`. `solve(pose, true)` sets the shoulders
wider for a bulky build.

`RigDef` is the rig's proportions in grid pixels: frame `width`/`height`, the rest positions of `chest`, shoulders and
hips, `limbWidth`, and how dark the far limbs are (`backShade`, `backArmShade`). Write your own to rig a body of
other proportions; the poses are only angles and lengths, so they carry over roughly.

## The pose library and clips

`HUMANOID_POSES` maps names to poses: `BREATHE0`–`5`, `STRIDE0`–`5`, `JOG0`–`7`, `ROLL0`–`11`, `DASH`, `HURT`,
`CROUCH`, `SIT`, `WAVE_A`/`B`, the attack keys (`SLASH_*`, `THRUST_*`, `OVERHEAD*`, `CAST*`, `THROW_*`) and more.
`HUMANOID_CLIPS` strings them into motion: `idle`, `walk`, `run`, `roll`, `dash`, `hurt`, `dizzy`, `crouch`, `kneel`,
`sit`, `sitGround`, `pick`, `lookBack`, `stretch`, `cheer`, `wave`, `dance`, `slash`, `thrust`, `overhead`, `cast` and
`throw` (the type `HumanoidClip`).

A `PoseClip` is:

| Field | Default | |
|---|---|---|
| `poses` | — | keys, by name in the player's library or inline `RigPose`s |
| `fps` | 8 | keys per second |
| `durations` | — | per-key lengths in ms, overriding `fps` |
| `loop` | `true` | start over at the end, blending the last key into the first |
| `blend` | `true` | blend between keys; `false` steps from key to key (pixel-art timing) |

## Playing a clip

```ts
import { PosePlayer, RigView, HUMANOID_RIG, HUMANOID_POSES, HUMANOID_CLIPS } from '1681-engine';

const view = new RigView(HUMANOID_RIG, {}, undefined, { scale: 3 }); // vector parts, 3 world px per grid px
this.root.addChild(view);
const poses = new PosePlayer(HUMANOID_POSES, HUMANOID_CLIPS, 'idle');

// each frame (a 'frame' system or the scene's update):
poses.play(moving ? 'walk' : 'idle', { fadeMs: 120 }); // the clip already playing keeps its place
poses.update(dt); // seconds
view.setPose(poses.pose);
view.position.set(x, y); // the view's origin is the feet
view.facing = goingLeft ? -1 : 1;
```

`play(name, { fadeMs, restart })` crossfades from the pose shown now over `fadeMs`. Asking for the clip already
playing does nothing unless `restart: true`. A clip that does not loop holds its last key, sets `finished` and calls
`onComplete(name)` once. `speed` scales time, `current` names the clip, `time` is ms into it, and `sample(ms)` is the
current clip's pose at any moment without advancing. Your own clips can mix library names and inline poses:

```ts
const clips = {
  ...HUMANOID_CLIPS,
  bow: { poses: ['BREATHE0', { by: 2, headDy: 2, armF: [100, 2, 0, 2] }, 'BREATHE0'], durations: [80, 400, 120], loop: false },
};
const poses = new PosePlayer(HUMANOID_POSES, clips, 'idle');
```

## Mixing poses

Three pure functions in `poseMath`:

- `blendPose(a, b, k)` is the in-between at `k` (0 = `a`, 1 = `b`): bones turn the shortest way and stretch, offsets
  slide. What cannot be in between (`face`, `trail`, `smearArm`, a curl one side lacks) stays `a`'s until `k` reaches 1.
- `overlay(base, top)` is `top` laid over `base`: every field `top` sets wins. A guard that only moves the weapon arm
  is a one-field pose overlaid on whatever the body is doing.
- `upperOver(action, legs)` is an action's upper body over a moving body: arms, head and face from `action`; legs,
  hips and the cape trail from `legs`; the far arm swings with the gait unless `action.armBFront` (both hands on a bow).
  The chest takes both bobs but rises at most a pixel.

### An attack while running

A `PosePlayer` plays one clip at a time, so an upper-body action over a gait takes two players:

```ts
import { PosePlayer, upperOver, HUMANOID_POSES, HUMANOID_CLIPS } from '1681-engine';

const legs = new PosePlayer(HUMANOID_POSES, HUMANOID_CLIPS, 'idle');
const arms = new PosePlayer(HUMANOID_POSES, HUMANOID_CLIPS, 'idle');
let attacking = false;
arms.onComplete = () => (attacking = false);

function attack() {
  arms.play('slash', { restart: true }); // restart: a second swing starts over
  attacking = true;
}

function draw(dt: number, moving: boolean) {
  legs.play(moving ? 'run' : 'idle', { fadeMs: 120 });
  legs.update(dt);
  arms.update(dt);
  view.setPose(attacking ? upperOver(arms.pose, legs.pose) : legs.pose);
}
```

## Drawing: `RigView`

`new RigView(def, skin = {}, textures?, options = {})` is a Pixi `Container` with one layer per part, drawn back to
front in `RIG_PARTS` order: `upperArmB`, `forearmB`, `thighB`, `shinB`, `torso`, `thighF`, `shinF`, `head`,
`upperArmF`, `forearmF`. Options are `scale` (world px per grid px, default 1), `headRadius` (default 5), `headRise`
(how far above the chest point the head's centre sits, default 5.5) and `bulky`.

A part with no texture is a vector shape: a round-capped line for a limb, a rounded box for the torso, a circle for
the head, in `color` (a default per part; the far limbs darkened by the rig's shades), `width` grid px thick and an
`outline` (a dark one by default, `null` for none).

```ts
const knight = new RigView(HUMANOID_RIG, {
  torso: { color: 0x8a96a8 },
  upperArmF: { color: 0x8a96a8 },
  upperArmB: { color: 0x8a96a8 },
  head: { color: 0xe8c39e, outline: null },
}, undefined, { scale: 3, bulky: true });
```

A part with a `texture` (a key, and `frame`, in the stage's `TextureRegistry`) is a cut-out image. Its anchor sits on
the bone's root joint (`anchorX`/`anchorY`, default 0.5, 0: top centre) and it turns so the image's **downward** axis
follows the bone; `stretch: true` stretches it along the bone to the next joint. Images are drawn at world scale (one
image pixel is one world pixel, whatever `scale` is). Pass the registry, or the texture is ignored:

```ts
import { RigView, HUMANOID_RIG, type RigSkin } from '1681-engine';

const skin: RigSkin = {
  torso: { texture: 'hero', frame: 'torso' }, // hangs from the chest towards the hips
  head: { texture: 'hero', frame: 'head', anchorY: 0.5 }, // the head's point is its centre
  upperArmF: { texture: 'hero', frame: 'arm', stretch: true },
  forearmF: { texture: 'hero', frame: 'forearm' },
};
const hero = new RigView(HUMANOID_RIG, skin, this.engine.stage.textures, { scale: 3 });
```

Parts left out of a skin stay vector, so a rig can be skinned one part at a time. `lastJoints` gives the joints of
the last pose in grid px, and `jointInParent('wristF')` where a joint is in the view's parent, in world px: where to
put a held sword, a muzzle flash or a lantern.

## Pitfalls

- **`RigView` draws only the skeleton.** It reads `by`, the limbs, the hip and head offsets and `curl`. `face`,
  `lookBack`, `trail`, `breathe`, `sway`, `smearArm` and `armBFront` are carried through `blendPose`, `overlay` and
  `upperOver` but drawn by nothing in the engine; the far arm is always behind the body.
- **Draw cut-out images pointing down.** A part is rotated by the bone's angle minus 90°, so an image of an arm
  hanging down is the right way up at rest. The head's root point is its centre, so give a textured head
  `anchorY: 0.5`.
- **`RigDef.scale` is not what `RigView` scales by.** The view uses `options.scale`; the def's `scale` is unused here.
- **`setPose` every frame, after `update`.** The view keeps the last pose it was given; a player advancing on its
  own changes nothing on screen.
- **Names are checked when named, not when shown.** A clip naming a pose missing from the library throws in the
  constructor or in `play`, so a typo fails at once rather than mid-game.
- **`facing` is a scale.** It sets `scale.x` to `±scale`; don't also set `view.scale` yourself, or one overwrites the
  other. The origin is the feet (bottom centre of the rig's frame), so set `position` to where the body stands.
- **A finished clip stays finished.** After a non-looping clip ends, `play` with the same name does nothing; pass
  `restart: true` to play it again (the night-garden roll does).
- **Poses are shared objects.** `blendPose` at `k <= 0` or `k >= 1` returns its argument itself, and `PosePlayer`
  hands out library poses as they are. Never mutate a pose you were given; build a new one with `overlay`.

## API

[`Skeleton`](/api/index/classes/Skeleton) · [`RigView`](/api/index/classes/RigView) ·
[`PosePlayer`](/api/index/classes/PosePlayer) · [`PoseClip`](/api/index/interfaces/PoseClip) ·
[`RigPose`](/api/index/interfaces/RigPose) · [`RigDef`](/api/index/interfaces/RigDef) ·
[`blendPose`](/api/index/functions/blendPose) · [`overlay`](/api/index/functions/overlay) ·
[`upperOver`](/api/index/functions/upperOver) · [`RigSkin`](/api/index/type-aliases/RigSkin) ·
[`PartSkin`](/api/index/interfaces/PartSkin)
