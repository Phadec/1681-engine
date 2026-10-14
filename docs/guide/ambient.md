# Time of day, weather and colour

The ambient module gives a world its hour and its sky without a packet between players: the time of day and the
weather are pure functions of the wall clock, so every client that agrees on the time (`serverNow()`) stands in the
same dusk and the same rain. The pixel module adds the pixel-art half: a dithered outdoor night, sprites that sway in
the wind by whole pixels, and a dithered screen edge.

| Piece | Module | What |
|---|---|---|
| `DayClock` | core | the hour, its colour and how dark it is |
| `weatherAt` | core | which weather a place has now, rolled from the time |
| `WeatherLayer` | core | rain, snow, ash or fog on screen, from texture keys you give it |
| `ColorGrade`, `gradeAt` | core | a light colour laid over the world in multiply |
| `NightShade` | `/pixel` | the night as dithered darkness, lamps cutting holes in it |
| `paintWeatherArt` | `/pixel` | a set of weather sprites painted in whole pixels |
| `SwayProp` | `/pixel` | a tree, bush, reed bank or banner swaying in whole pixels |
| `DitherVignette` | `/pixel` | a dithered edge round the screen (a low-health pulse) |

## A day

```ts
import { DayClock, serverNow } from '1681-engine';

const clock = new DayClock({
  periodMs: 2 * 3600_000, // a game day every two real hours
  keys: [
    { at: 0, color: 0x0a1030, alpha: 0.52 }, // midnight
    { at: 0.3, color: 0xfff0d8, alpha: 0 },
    { at: 0.7, color: 0xffb070, alpha: 0 },
    { at: 0.86, color: 0x0a1030, alpha: 0.52 },
    { at: 1, color: 0x0a1030, alpha: 0.52 }, // same as 0: midnight is seamless
  ],
  phases: [{ id: 'dawn', from: 0.2 }, { id: 'day', from: 0.3 }, { id: 'dusk', from: 0.7 }, { id: 'night', from: 0.8 }],
});

const day = clock.at(serverNow()); // { phase, id, color, alpha, night }
```

Phase 0 is midnight and 0.5 noon. A key is the grade laid over the outdoor world at that point of the day, mixed
between neighbours; `night` runs from 0 by day to 1 at the darkest key, which is how much lamps matter. `offsetMs`
shifts the day against the clock (the same offset on every client keeps them together), and `clock.hold(0)` freezes it
at midnight for a cut scene or a debug command (`hold(null)` lets it run). `mixRgb` and `tintNight` are the colour
helpers it uses.

Nothing here draws. A `LightLayer` (smooth art) or the pixel `NightShade` reads what the clock returns, and so can a HUD
badge. [`examples/platformer/Backdrop.ts`](/examples#platformer) colours its sky from a `DayClock` whose whole day
passes in two minutes.

## Colour grade

`ColorGrade` lays one colour over the whole screen in **multiply**, so it tints the world (a marsh mossy, a peak ember)
without washing the art toward white the way a normal-blend sheet does. It is one white quad, no filter pass.

```ts
import { ColorGrade, gradeAt, type Grade } from '1681-engine';

const MARSH: Grade = { color: 0x6a8a5a, day: 0.06, night: 0.12 };

const grade = new ColorGrade(this.engine.stage, () => gradeAt(MARSH, clock.at(serverNow()).night), { placement: 'bottom' });
// each frame
grade.update(performance.now(), settings.regionGrade && !settings.batterySaver);
// onExit
grade.destroy();
```

- `read` is asked every `readEveryMs` (500), not every frame; `invalidate()` asks again at once (the place changed). A
  grade that comes to white is not drawn at all.
- `gradeAt` never lays a grade past `max` (0.14): one laid too strong washes every sprite toward one colour.
- **`placement: 'bottom'`** puts the sheet under every child of the screen layer, so it tints the world and never the
  HUD, whichever was made first. The default `'top'` covers a HUD made before it.
- Pass `enabled: false` to turn it off under a battery saver: a full-screen blend is a cost on a phone.

The platformer reads its grade straight from the day clock's `color` and `alpha`.

## Weather

`weatherAt(place, time, table)` rolls a weighted list per time slot from a hash of the place and the slot, so the
same table, place and time give the same sky on every machine. A change of kind fades out at the end of its slot and
in at the start of the next.

```ts
import { WeatherLayer, weatherAt, type WeatherTable } from '1681-engine';
import { paintWeatherArt } from '1681-engine/pixel';

type Kind = 'rain' | 'snow' | 'fog';
const TABLE: WeatherTable<Kind> = {
  slotMs: 12 * 60_000,
  fadeMs: 40_000,
  places: {
    meadow: [{ kind: 'clear', weight: 4 }, { kind: 'rain', weight: 3, intensity: [0.4, 1] }],
    woods: [{ kind: 'clear', weight: 3 }, { kind: 'rain', weight: 3 }, { kind: 'fog', weight: 1 }],
  },
  skies: { lowland: { places: ['meadow', 'woods'], entries: [{ kind: 'clear', weight: 4 }, { kind: 'rain', weight: 3 }] } },
};

const looks = paintWeatherArt(this.engine.stage.textures); // rain, snow, ash and fog, in whole pixels
const weather = new WeatherLayer<Kind>(this.engine.stage, { looks: { rain: looks.rain, snow: looks.snow, fog: looks.fog } });

// each frame
const cam = this.engine.stage.cameras.main;
weather.update(now, dtMs, cam.worldView, weatherAt('meadow', serverNow(), TABLE), settings.reducedFx ? 0.5 : 1);
```

- Places in one `skies` group share the **kind** (the rain does not stop at a map's edge) and take only the strength
  from their own list. A place with no list (a cave) has no weather, even inside a sky.
- `'clear'` is no weather and has no strength.
- `WeatherLayer` keeps a capped pool that lives only inside the camera's view, rebuilt only when the kind changes; a
  thinning shower hides particles rather than freeing them. A look's motion is `fall` (rain, with an optional
  two-frame splash), `flake` (snow, ash, petals) or `bank` (fog, laid over the bodies); `tint` lays a screen-wide
  colour (fog is mostly tint). Keep `max` in the low hundreds on a phone.
- The art is the game's: a `WeatherLook` names texture keys. `paintWeatherArt` paints a pixel set and takes your own
  colours (`WEATHER_COLORS` are the defaults); smooth art brings its own textures.

## Pixel art: `NightShade`

The outdoor night as a dithered `Darkness`: the clock's grade laid over the world, deepening at dusk and lifting at
dawn, every lamp, window and fire burning a hole in it. At noon the sheet has no alpha and costs nothing.

```ts
import { NightShade } from '1681-engine/pixel';

const night = new NightShade(this.engine.stage, { clock, tint: 0x1a2a50, carriedLight: 64 });
for (const lamp of lamps) night.addLight(lamp.x, lamp.y, lamp.glowSize, 0xffc070, 0.05);

// each frame: the frame's time, the shared wall time, and the player
night.update(performance.now(), serverNow(), hero.x, hero.y);
```

- `tint` is the place's own night colour, pulled in as the night deepens (`tintShare`, 0.6 at full night).
- `addLight`'s size is the **diameter of the glow drawn for the lamp**; the hole reaches past it by `lampScale` (1.6).
- The player carries a light of `carriedLight` px at full night, from `carriedFrom` (0.55) on: at dusk a hole round the
  feet reads as a spotlight.
- `setLampsDimmed(true)` makes lamps colour the dark less (a "fewer lights" setting); their holes stay as wide.
- A place under no sky (a cave) builds a `Darkness` of its own instead.

## Pixel art: `SwayProp`

A sprite is never repainted to sway: its frame is sliced into still pieces and strips that move sideways by whole
world pixels, the way a pixel artist draws a bough bending.

```ts
import { SwayProp, tileHash, type SwayDef } from '1681-engine/pixel';

const OAK: SwayDef = { mode: 'crown', amp: 1, speed: 0.35 };

this.root.addChild(tree); // the image must already be in its parent
const sway = new SwayProp(tree, OAK, { phase: tileHash(tx, ty), pace: 0.9 + 0.2 * tileHash(tx, ty, 1) });

// each frame
sway.update(now / 1000, { wind: 0.6, gustSeconds: 7, gustPx: 320 }, settings.ambientFx);
```

Modes: `crown` (a tree: the canopy over the trunk sways, the trunk found in the pixels), `top` (the top share of the
frame: a bush, a reed clump), `hang` (cloth off a bar, each pair of rows swinging wider and later) and `tufts` (only the
given rects move: reeds painted into a bigger sprite). The placed image becomes the rig's first piece, so whatever
culls, fades or sorts it keeps working; `active` is false when there was nothing to move. Give each prop its own
`phase` and a slightly different `pace`, or a wood sways in step. Reading the frame's pixels for a `crown` needs a 2D
canvas source (an atlas page or a painted texture); otherwise pass `rowWidths`.

## Pixel art: `DitherVignette`

A dithered edge round the screen on the screen layer: a darkened border, or tinted red and beaten with `heartbeat`
while the player is low on health.

```ts
import { DitherVignette, heartbeat } from '1681-engine/pixel';

const edge = new DitherVignette(this.engine.stage, { color: 0xa01010, from: 0.55 });
// each frame
if (hp < 0.3) edge.show(heartbeat(now, 1 - hp / 0.3));
else edge.hide();
```

The texture is made off the first frame that needs it (a full-screen dither is a few ms on a phone) and only again when
the window or the zoom changes. Offer a "reduce flashes" setting that hides it.

## API

[`DayClock`](/api/index/classes/DayClock) · [`weatherAt`](/api/index/functions/weatherAt) ·
[`WeatherLayer`](/api/index/classes/WeatherLayer) · [`ColorGrade`](/api/index/classes/ColorGrade) ·
[`gradeAt`](/api/index/functions/gradeAt) · [`NightShade`](/api/pixel/classes/NightShade) ·
[`paintWeatherArt`](/api/pixel/functions/paintWeatherArt) · [`SwayProp`](/api/pixel/classes/SwayProp) ·
[`DitherVignette`](/api/pixel/classes/DitherVignette)
