# Diagnostics and debug

Two halves. **Diagnostics** are for players' devices: catching errors nothing else caught, surviving a lost WebGL
context, noticing a start that hangs, and measuring how the game really runs. The engine sends nothing anywhere; each
piece hands you what it found and the game decides what to do with it (a readout, a report to its server).
**Debug** is for you: `DebugOverlay`, toggled by a key.

## Errors: `captureErrors`

```ts
import { Engine, captureErrors } from '1681-engine';

const engine = await Engine.create({ parent: document.getElementById('app')! });
const stop = captureErrors((e) => {
  // e.message, e.stack (first lines), e.source: 'uncaught' | 'rejection' | 'frame'
  void fetch('/api/client-error', { method: 'POST', body: JSON.stringify(e) });
});
```

It listens for `error` and `unhandledrejection` on the window and for what a `Stage` frame step caught (`frame`: a step
that threw and was skipped so the frame could go on; there a fault shows only as a stuck view). Each distinct error is
reported once, ten in all by default (`max`). Hand the same `ErrorDeduper` to your own reports (`deduper`, then
`deduper.admit(message)` before sending) so one error is not told twice.

::: warning Install it after `Engine.create`
The engine sets `Stage.onCaught` to forward frame faults to `engine.events` (`'error'`). `captureErrors` chains onto
whatever is there when it is installed and puts it back on uninstall; installed before the engine, it would be
replaced.
:::

## A lost WebGL context

A context can be taken away at any time: a phone's GPU resetting, a driver crash, an Android WebView taking the GPU
back from an app in the background. Pixi does not rebuild a lost world by itself.

```ts
import { watchContextLoss } from '1681-engine';

watchContextLoss(engine.app.canvas, (verdict) => {
  if (verdict.giveUp) showError('Your graphics driver keeps failing. Try closing other tabs and reloading.');
  else setTimeout(() => rebuildWorld(), verdict.delayMs);
});
```

The event's default is prevented, which is what lets the browser restore the context at all. After `maxLosses` (3)
within `windowMs` (two minutes) the verdict says `giveUp`: a GPU that keeps dropping it will not be saved by another
try. A loss while the page is hidden is the system taking the GPU back and is not counted against it. Each rebuild
waits longer than the last (`rebuildDelayMs`): a rebuild at once was dropped at once on a phone.

## A renderer that throws: `guardRender`

```ts
import { guardRender } from '1681-engine';

guardRender(engine.app, (detail) => showError(`The game stopped drawing: ${detail}`));
```

A ticker listener that throws never asks for the next frame. The stage guards the game's own steps, not Pixi's render:
a render that threw on its first frame froze the canvas in silence. `guardRender` lets a single bad frame go and
reports `failures` (30) in a row once. `describeError(err)` is the error as one short line for a player's screenshot.

## A start that hangs: `bootWatch`

```ts
import { bootWatch } from '1681-engine';

const boot = bootWatch(20_000, (stall) => showError(`Loading is taking too long (${stall.detail})`));
boot.step('fonts');
await document.fonts.ready;
boot.step('textures');
await assets.load();
boot.step('world');
buildWorld();
boot.done();
```

Named steps turn "it hangs" into "it hangs loading textures": `stall.steps` has every step reached with its time.

## How it runs: `FrameSampler`

```ts
import { FrameSampler } from '1681-engine';

const sampler = new FrameSampler((s) => {
  // s.fps, s.fpsLow (the 1% low: what stutter feels like), s.frameP95, s.frameMedian, s.worstMs, s.hitches
  report(s);
}, { windowMs: 60_000, hitchMs: 50 });
sampler.attach(engine.app.ticker);
```

Each frame costs one number pushed on an array; once a window is full it is summed into a `FrameSummary`. Frames are
not counted while the page is hidden, and a window with fewer than `minFrames` is no sample. A window covered by another
is not `hidden` but runs at about a frame a second, so a window whose median frame is over `throttledMedianMs`
(500) is dropped too (`looksThrottled` is that test, for summaries of your own).
`maxTextureSize(renderer)` and `gpuName(renderer)` tell devices apart in such a report; many phones stop at 4096.

## `DebugOverlay`

```ts
import { DebugOverlay, drawColliders } from '1681-engine';

new DebugOverlay(engine, {
  key: 'F3', // default Backquote; its browser action (F3's find bar) is prevented
  // draw(x, y, w, h, color) for boxes of your own, line(x0, y0, x1, y1, color) for rays and turned shapes
  colliders: (draw, line) => drawColliders(physics, draw, {}, undefined, line),
  components: [Position, Health], // what the inspector lists (default: every entity, everything it holds)
});
```

It shows FPS with a frame-time graph, draw calls and GPU textures, the entity count, a list of entities and their
components, collision boxes, and the last errors the frame guard caught. Hidden, it costs nothing per frame: only the
key and the engine's `error` event are listened to, so faults from before it was opened are still listed.

The `colliders` callback is asked every shown frame. When the bodies belong to a scene, keep a field the scene sets on
entry and clears on exit, as [`examples/platformer`](/examples#platformer) does (`game.debugBoxes`), so the overlay
never draws a world that has gone. Draw calls are counted on WebGL only; on WebGPU the line says so.

The pieces are exported for tools of your own: `FrameStats` (a ring of frame times), `ErrorLog` (distinct faults with
a repeat count), `inspectWorld` (entity rows with a preview of each component) and `DrawCallCounter`.

## API

[`captureErrors`](/api/index/functions/captureErrors) · [`ErrorDeduper`](/api/index/classes/ErrorDeduper) ·
[`watchContextLoss`](/api/index/functions/watchContextLoss) · [`guardRender`](/api/index/functions/guardRender) ·
[`bootWatch`](/api/index/functions/bootWatch) · [`FrameSampler`](/api/index/classes/FrameSampler) ·
[`FrameSummary`](/api/index/interfaces/FrameSummary) · [`DebugOverlay`](/api/index/classes/DebugOverlay) ·
[`inspectWorld`](/api/index/functions/inspectWorld)
