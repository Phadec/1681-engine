# Scene transitions

`transitionTo` changes scene behind a transition: it covers the screen, swaps the scene underneath (waiting out an
async `onEnter` while covered), then reveals the new one. Three transitions come with the engine, and `Letterbox`
slides cinema bars in for a cut scene.

## Fade to the next level

```ts
import { FadeTransition, transitionTo } from '1681-engine';

await transitionTo(engine, new Level2(), new FadeTransition({ color: 0x14101c, duration: 300, hold: 120 }));
```

The mode is the fourth argument: `'replace'` (the default), `'push'` (a menu over the level) or `'pop'` (for which the
scene argument is ignored, pass `null`).

```ts
await transitionTo(engine, new PauseMenu(), new FadeTransition({ duration: 150 }), 'push');
await transitionTo(engine, null, new FadeTransition({ duration: 150 }), 'pop');
```

The promise resolves when the reveal ends. If the scene change throws, the overlay is still removed and the
transition disposed, and the error is thrown again: catch it.

## The three transitions

| Transition | Look | Options |
|---|---|---|
| `FadeTransition` | to a colour and back | `color`, `duration` (each half, 300), `hold` (ms fully covered) |
| `CrossfadeTransition` | the old scene's last frame fades out over the new one | `duration` (400) |
| `DitherWipeTransition` | an ordered-dither pattern sweeps across in hard cells | `color`, `duration` (each half, 450), `direction`, `cell`, `softness` |

`DitherWipeTransition` is the pixel-art one: `direction` is `'left'`, `'right'`, `'up'`, `'down'`, or `'none'` for the
whole screen dissolving at once, and a cell is one world pixel by default (the main camera's zoom). It draws a texture
swap per band, not a rect per cell.

`CrossfadeTransition` captures the old frame into one screen-sized render texture, since two scenes cannot both be
live; the new scene's `onEnter` runs under the still frame, so a long load reads as a pause.

## In a game

Keep the scene changes in one place, and refuse a second while one runs: a button pressed twice during a wipe must not
start two. From [`examples/platformer/Game.ts`](/examples#platformer):

```ts
private moving = false;

get busy(): boolean {
  return this.moving;
}

startLevel(): void {
  this.go(this.scenes.level(), new DitherWipeTransition({ color: 0x14101c, duration: 380, direction: 'right' }));
}

private go(next: Scene, transition: Transition): void {
  if (this.moving) return;
  this.moving = true;
  transitionTo(this.engine, next, transition)
    .catch((err) => this.engine.reportError('transition', err))
    .finally(() => (this.moving = false));
}
```

`transitionTo` itself also queues: a second call waits for the first instead of drawing over it. Menus check `busy`
before handling input, so the title's buttons do nothing while the wipe is running.

## Writing your own

A `Transition` is two halves around the swap and a clean-up:

```ts
import { tweenDone, type Transition, type TransitionContext } from '1681-engine';
import { Sprite, Texture } from 'pixi.js';

class IrisTransition implements Transition {
  private sheet: Sprite | null = null;

  async cover(ctx: TransitionContext) {
    this.sheet = new Sprite(Texture.WHITE);
    this.sheet.tint = 0x000000;
    this.sheet.alpha = 0;
    this.sheet.setSize(ctx.stage.width, ctx.stage.height);
    ctx.layer.addChild(this.sheet);
    await tweenDone(ctx.stage, { targets: this.sheet, alpha: 1, duration: 250 });
  }

  async reveal(ctx: TransitionContext) {
    await tweenDone(ctx.stage, { targets: this.sheet!, alpha: 0, duration: 250 });
  }

  dispose() {
    this.sheet = null; // ctx.layer and its children are destroyed by transitionTo
  }
}
```

`ctx.layer` sits over the world and screen layers, every scene's HUD included, for the length of the transition.
`tweenDone` runs a tween on the stage and resolves when it completes; because both halves ride the stage's tweens,
they follow its time scale and stop while the engine is paused.

## Letterbox

```ts
import { Letterbox } from '1681-engine';

const bars = new Letterbox(engine.stage, { share: 0.12 }); // each bar 12% of the screen's height
await bars.show(400);
// … the cut scene …
await bars.hide(400);
bars.destroy();
```

The bars sit on the stage's screen layer above whatever was there when they were made; a HUD added later draws over
them, so hide it for the scene. Their heights are whole screen pixels at every step of the slide.

## Pitfalls

- `SceneManager.replace` resets the shared camera (target, bounds, zoom, shake) between the old scene leaving and the
  new one entering. Set the new scene's bounds and follow in its `onEnter`.
- A scene's timers should be `this.delay(ms, fn)`, not `stage.time.delayedCall`: the stage's timers keep running after
  the scene has gone, into the next one.

## API

[`transitionTo`](/api/index/functions/transitionTo) · [`Transition`](/api/index/interfaces/Transition) ·
[`FadeTransition`](/api/index/classes/FadeTransition) · [`CrossfadeTransition`](/api/index/classes/CrossfadeTransition) ·
[`DitherWipeTransition`](/api/index/classes/DitherWipeTransition) · [`Letterbox`](/api/index/classes/Letterbox) ·
[`tweenDone`](/api/index/functions/tweenDone)
