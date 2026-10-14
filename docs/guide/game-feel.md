# Game feel: floating text and hit-stop

Small things that make a blow land: a number that pops off the body, a freeze-frame, a recoil, a white flash, the
screen shaking along the blow. The engine gives you the pooled text and the numbers; when to freeze is the game's.

## Floating text

`FloatingText` draws damage numbers, pickups and "+1" from bitmap fonts and reuses them. A crowded fight throws dozens
a second; as canvas text, each one repainted a canvas and uploaded it.

```ts
import { FloatingText, type FloatingTextStyle } from '1681-engine';

const HIT: FloatingTextStyle = { size: 10, color: '#ffffff' };
const CRIT: FloatingTextStyle = { size: 14, color: '#ffd040' };

await document.fonts.load('10px "My Pixel Font"'); // a font must be loaded before it is baked
const numbers = new FloatingText(this.engine.stage, { fontFamily: 'My Pixel Font', depth: 900_000, parent: this.root });
numbers.warm([HIT, CRIT]); // bake the fonts ahead, one a task, starting a second from now

// on a hit
numbers.float(target.x, target.y - 20, String(damage), crit ? CRIT : HIT, { rise: 16, driftX: (Math.random() - 0.5) * 8 });

// onExit
numbers.clear();
```

- A **style** is a size and a colour, and each is its own baked font. Bake them while the world loads (`warm`, or
  `install` for one now): a style first met mid-fight baked its glyph pages on that frame, and ten at once froze a
  world's first frame half a second.
- `float` pops a label from `pop`× (1.4) to full size, holds it `holdMs`, then rises `rise` px while fading over
  `fadeMs`, and hands it back to the pool. `take` and `release` are the manual form, for a motion of your own.
- `parent: this.root` makes the labels live and die with the scene. On the default (the stage's world layer) they
  outlive it, and one still floating when the scene changes stays.
- Bitmap fonts bake ASCII only. Letters beyond it (é, ñ, ư) go in `glyphs`, or in `addLabelGlyphs` for every font.
- `driftX` with a little randomness keeps a crowd of numbers from stacking on one spot.

[`examples/platformer/Effects.ts`](/examples#platformer) floats a "+1" over every coin.

## Hit-stop, recoil and the white flash

`hitStop` holds the curves a game tuned on phones, pure so the numbers can be pinned in a test:

```ts
import { hitStopMs, hurtFlashMs, recoilAt, recoilPx, RECOIL_MS } from '1681-engine';

const share = damage / target.maxHp;
const freeze = hitStopMs(share, crit); // 40 ms for a scratch, up to 140 for a third of the body; a crit +40
const push = recoilPx(target.isBoss, share, crit); // whole world pixels away from the striker: 1–3, a big body barely
const flash = hurtFlashMs(target.isBoss, crit && mine, settings.reduceFlashes); // 70, 140 for one's own crit, 0 reduced
```

Applying them is the game's. A freeze-frame is simplest as a pause of the simulation, not of the drawing:

```ts
class Level extends Scene {
  private frozenUntil = 0;

  hit(target: Enemy, damage: number, crit: boolean, angle: number) {
    this.frozenUntil = performance.now() + hitStopMs(damage / target.maxHp, crit);
    target.recoil = { px: recoilPx(target.isBoss, damage / target.maxHp, crit), angle, at: performance.now() };
    this.engine.stage.cameras.main.shake(90, 0.004, angle); // along the blow
  }

  override fixedUpdate(dt: number) {
    if (performance.now() < this.frozenUntil) return; // the world holds; the frame still draws
    // … the simulation …
  }

  override update() {
    for (const e of this.enemies) {
      const t = (performance.now() - e.recoil.at) / RECOIL_MS;
      const off = recoilAt(e.recoil.px, t); // out at once, eased back, whole pixels only
      e.view.x = Math.round(e.x + Math.cos(e.recoil.angle) * off);
    }
  }
}
```

The scene's `world` runs its `fixed` systems before `fixedUpdate`, so a simulation that lives in systems checks the
same `frozenUntil` at the top of each of them. Keep the freeze short (the curve stops at 180 ms with a crit): longer
reads as a stall, and in multiplayer only the client's own view should hold, never the server's step.

A heavy body (a boss, anything drawn large) flashes only for the local player's own crit, 60 ms, at most every
`HEAVY_FLASH_GAP_MS` (400): a sheet covering most of the screen turning white on every blow is a strobe. Sparks,
numbers and the recoil still mark every blow. Offer a "reduce flashes" setting and pass it to `hurtFlashMs`.

## A flash without a filter: `solidSilhouette`

`setTintFill` fills a body through a filter, and a filter is a render pass of its own: an area blow landing on twenty
bodies cost twenty passes for a few frames, which dragged a crowded fight down on weak GPUs. `solidSilhouette` makes
the frame's flat silhouette once, as a texture, and caches it; a flashing body only swaps its texture and still batches
with everything else.

```ts
import { solidSilhouette, clearSilhouettes } from '1681-engine';

const normal = body.texture;
const white = solidSilhouette(normal); // cached per frame; null when the frame cannot be read
if (white) {
  body.texture = white;
  body.tint = 0xff4040; // a white silhouette tinted is that colour wherever the body is opaque
} else body.setTintFill(0xff4040); // the filter as a fallback
this.delay(flash, () => {
  body.texture = normal;
  body.tint = 0xffffff;
});
```

Ask for white and tint it: one texture per frame serves every colour (a `color` argument bakes one in instead). Only
for frames that are never repainted (atlas frames, snapshots); a body repainted every frame is copied first
(`TextureRegistry.snapshotInto`) and the copy painted with `fillSolid(canvas, color)`. `clearSilhouettes(texture)`
frees one frame's silhouettes, `clearSilhouettes()` all of them (an atlas rebuilt).

## Afterimages

`Afterimages` leaves fading copies of a moving body — a dash, a blink — as tinted silhouettes, from a pool, at most
one every `spacingMs`:

```ts
import { Afterimages } from '1681-engine';

const ghosts = new Afterimages(stage, { tints: [0xffffff, 0x9fe6ff, 0x5a9cff], alpha: 0.6, durationMs: 260, spacingMs: 22 });

// each frame of a dash; the copy stands where the body is drawn, just behind a body sorted by y
const copy = ghosts.trail(body, hero.x + body.x, hero.y + body.y, now, hero.y - 1);
if (copy) drawSpeedStreak(); // null: too soon, or the frame could not be read
```

A body marked live (`TextureRegistry.markLive`, repainted every frame) is snapshotted into a ring of `slots` textures
that are reused, never a new canvas a copy. Copies blend `'add'` by default (light); pass `blend: 'normal'` for painted
shadows. `destroy()` takes the copies and the ring's textures away.

## Skipping what nobody sees

`inView(camera, x, y, margin)` says whether a world point is within `margin` world pixels of the screen. Effects use it
to skip painting off screen; `Emitter` and `paintLayer` already do.

## API

[`FloatingText`](/api/index/classes/FloatingText) · [`FloatOptions`](/api/index/interfaces/FloatOptions) ·
[`hitStopMs`](/api/index/functions/hitStopMs) · [`recoilPx`](/api/index/functions/recoilPx) ·
[`recoilAt`](/api/index/functions/recoilAt) · [`hurtFlashMs`](/api/index/functions/hurtFlashMs) ·
[`inView`](/api/index/functions/inView) · [`Camera.shake`](/api/index/classes/Camera#shake) ·
[`solidSilhouette`](/api/index/functions/solidSilhouette) · [`fillSolid`](/api/index/functions/fillSolid) ·
[`clearSilhouettes`](/api/index/functions/clearSilhouettes) · [`Afterimages`](/api/index/classes/Afterimages)
