# Tweens, timelines and parallax

Two tools for motion that is not simulation: `Timeline`, which lays tweens and calls out in time and plays them as one,
and `Parallax`, which scrolls layers of scenery at a share of the camera's speed. The platformer example uses both
(`examples/platformer/Backdrop.ts` for its hills, `LevelScene.celebrate` for the goal).

## Tweens

A single tween is `stage.tweens.add`, unchanged:

```ts
stage.tweens.add({ targets: sprite, alpha: 0, duration: 300, ease: 'Sine.InOut' });
```

## Timelines

A timeline is made from the stage's tween manager, so it follows `stage.tweens.timeScale` (hit-stop slows it with
everything else) and stops when the stage is destroyed:

```ts
import { Scene } from '1681-engine';

class Level extends Scene {
  celebrate(flag: { y: number }, banner: { alpha: number }) {
    const y = flag.y;
    const tl = this.engine.stage.tweens
      .timeline()
      .to(banner, { alpha: { from: 0, to: 1 } }, { duration: 300 })
      .to(flag, { y: y - 10 }, { duration: 140, ease: 'Quad.Out', at: '<' }) // starts with the banner
      .to(flag, { y }, { duration: 160, ease: 'Quad.In' })
      .call(() => console.log('landed'))
      .wait(200)
      .to(banner, { alpha: 0 }, { duration: 300 });
    return tl.finished; // a promise: `await scene.celebrate(…)`
  }
}
```

Children play one after another by default. `to(targets, props, options)` takes one object or an array, numeric
properties (`scale` writes `scaleX` and `scaleY`), and `{ from, to }` to start from a given value. A tween reads its
start values the first time the playhead reaches it, so a second tween on the same property starts where the first
ended. `duration` defaults to 1000 ms and `ease` to `'Quad.Out'`, as `Tweener`'s; `ease` also takes a function.

### Positions

Every child takes an `at`:

| `at` | Starts |
|---|---|
| left out | at the end of what came before |
| `250` | 250 ms from the timeline's start |
| `'<'` / `'>'` | with the start / at the end of the child added last |
| `'+=200'` / `'-=100'` | 200 ms after / 100 ms before the end (overlapping) |
| `'hit'`, `'hit+=50'` | at a label, or 50 ms after it |
| `'<+=80'`, `'>-=20'` | relative to the last child's start or end |

A label is set with `label(name, at?)`; one first named in a position is set at the timeline's end. Read it back with
`labelTime(name)`.

### Parallel groups and nesting

```ts
import { Timeline } from '1681-engine';

const intro = new Timeline()
  .parallel((t) => {
    t.to(title, { alpha: 1 }, { duration: 400 });
    t.to(title, { y: 40 }, { duration: 600, ease: 'Back.Out' });
    t.to(menu, { alpha: 1 }, { duration: 300, at: '+=200' }); // 200 ms into the group
  })
  .call(() => menu.focus());

const opening = stage.tweens.timeline().add(intro).wait(500).add(otherPart);
```

Inside `parallel` every child starts at the group's start (a position there is measured from it; `'>'` chains one
child after another inside the group), and what follows the group waits for its longest child. `add(timeline, at?)`
plays a built timeline as one child; it is then no longer stepped by itself.

### Playing

```ts
import { sound } from '1681-engine';

const pulse = stage.tweens.timeline({ repeat: -1, yoyo: true, repeatDelay: 100, onRepeat: () => sound.play('tick') });
pulse.to(icon, { scale: 1.2 }, { duration: 250 });

pulse.pause();
pulse.resume();
pulse.seek(125); // or a label; calls on the way are skipped unless `seek(at, true)`
pulse.reverse(); // plays back toward the start, calls firing on the way
pulse.timeScale = 2;
pulse.restart();
pulse.kill(); // stops where it stands and settles `finished`
```

`repeat` is extra plays (-1 forever), `yoyo` runs every second play backwards, `repeatDelay` waits between plays.
`onUpdate`, `onRepeat` and `onComplete` take the timeline; `onComplete` and `finished` come when the playhead reaches
the end it is playing toward. A call fires once as the playhead passes it, either way; at a yoyo's turn it fires once.

Build a timeline in the frame you make it: one stepped while empty has nothing to play and completes at once. Make it
`{ paused: true }` to build it over time and `play()` it later.

### Without a stage

Leave `tweens` out and step it yourself, e.g. from a fixed step or a test:

```ts
import { Timeline } from '1681-engine';

const box = { x: 0 };
const tl = new Timeline().to(box, { x: 100 }, { duration: 100, ease: 'Linear' });
tl.update(50); // box.x === 50
```

Like `Tweener`, a timeline skips targets that are destroyed display objects, and one repeating forever whose every
target is destroyed ends at its next turn rather than holding them for good. `Tweener.killTweensOf` does not reach
into timelines; stop one with `kill()`.

## Parallax

`Parallax` holds layers that scroll at a share of the camera's travel. Its `view` goes into the world layer (a scene's
`root`), sorted at depth -1000 by default so it stays behind the level, and `update(camera, dtMs)` places the layers
once a frame:

```ts
import { Graphics, Parallax, Scene } from '1681-engine';

class Level extends Scene {
  private readonly sky = new Parallax();

  override onEnter() {
    const { stage } = this.engine;
    const hills = new Graphics().fillStyle(0x6aa68a).fillRect(0, 80, 2000, 100);
    this.sky.add({ texture: stage.textures.get('clouds'), factorX: 0.1, factorY: 0, repeatX: true, offsetY: 12, speedX: -6 });
    this.sky.add({ display: hills, factorX: 0.5, factorY: 1 });
    this.root.addChild(this.sky.view);
  }

  override update(dt: number) {
    this.sky.update(this.engine.stage.cameras.main, dt * 1000);
  }
}
```

| Option | Meaning |
|---|---|
| `texture` / `display` | a texture (tiled where it repeats), or anything already drawn — one of the two |
| `factorX`, `factorY` | share of the camera's travel the layer moves on screen: 0 fixed to the screen, 1 with the world, above 1 in front; `factorY` defaults to `factorX` |
| `repeatX`, `repeatY` | tile a texture forever along that axis; the tiling sprite only ever covers the view |
| `offsetX`, `offsetY` | where the layer stands, world px |
| `speedX`, `speedY` | drift, world px a second (clouds) |
| `snap` | land on whole world pixels (default: on when the engine is `pixelPerfect`) |
| `cull` | hide the layer while none of it is in view (default on) |
| `depth` | order among the parallax's layers (default: the order they were added) |

Layers sit in the world layer, so the camera's zoom scales them like everything else. A `display` layer culls by its
content's bounds, measured when it is added: call `layer.remeasure()` after drawing into it. A foreground layer
(factor above 1) belongs in a second `Parallax` with a `depth` above the level's.

The arithmetic is exported for your own layers: `parallaxOrigin(scroll, factor, offset)` is where a layer stands,
`wrap(value, tile)` a pattern's phase, and `placeAxis` the whole placement of one axis.
