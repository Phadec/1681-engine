# Audio: sounds, music and footsteps

The engine plays two kinds of audio. **Sound effects** (`sound`, a `SoundEngine`) are short one-shots through Web
Audio: each one is a recorded take when the game registered any, else a small synth recipe rendered once into a
buffer. A sound placed in the world fades, pans and loses its highs with distance from a listener. **Music** (`music`,
a `MusicPlayer`) streams looping tracks through `<audio>` elements in named channels, crossfaded when a channel
changes track. Both read their volume from `engineSettings`, and both wait for the first user gesture, as browsers
require. Which happening plays which sound name stays in the game.

## Sound effects

Register the sounds once at boot, then play them by name:

```ts
import { registerSounds, registerTakes, sound } from '1681-engine';

// written, not recorded: a few oscillator or noise layers each
registerSounds({
  master: 0.5, // every sound plays at this share of the effects volume, so full volume stays modest next to music
  recipes: {
    jump: { layers: [{ w: 'square', f: [330, 660], t: 0.12, g: 0.25, duty: 0.25, lp: [3000, 2000] }] },
    land: { layers: [{ w: 'noise', f: [900, 900], t: 0.08, g: 0.3, lp: [1200, 400] }] },
    hit: { layers: [{ w: 'noise', t: 0.1, g: 0.4, lp: [4000, 800] }], fileGain: 0.8 },
  },
});

// recorded takes play instead of the recipe once decoded: hit.mp3, hit_2.mp3… are takes of `hit`
registerTakes(import.meta.glob('./sfx/*.mp3', { query: '?url', import: 'default', eager: true }));

// the world scene says where the listener stands
sound.listener = () => (hero ? { x: hero.x, y: hero.y } : null);

sound.play('jump', { local: true }); // the player's own: full weight, no distance
sound.play('hit', { x: enemy.x, y: enemy.y }); // someone else's, out in the world
sound.play('land', { local: true, gain: Math.min(1, fallSpeed / 400) });
sound.play('charge', { local: true, maxMs: castMs }); // ends with the cast, faded over 80 ms so it does not click
```

`SoundOptions`:

| Option | What it does |
|---|---|
| `x`, `y` | Where it happened. Against `sound.listener()` the gain falls as `(1 - d / hearing)^1.5`, the pan follows `dx / 320` (clamped to ±0.7) and a low-pass slides from 18 kHz beside the listener to 1.8 kHz at 480 px. Beyond hearing it is not played. |
| `local` | Done by or to the local player: full weight. Everything else plays at 0.45. |
| `gain` | Extra weight, default 1 (the final gain is capped at 1). |
| `range` | Hearing distance in px, only when nearer than the 480 px cap. |
| `minor` | Starts only while fewer than 6 voices play, so footsteps never take a blow's voice. |
| `maxMs` | Cuts the sound off after this long, with a fade. |

Kept lean on purpose: at most 10 voices at once, and the same name twice inside 60 ms is one sound (a cleave clipping
six bodies lands once). Each play also gets a small random pitch shift: the recipe's `jitter`, default 0.05.

The whole effects bus has its highs shelved down (−7 dB above 3.5 kHz) and its top cut at 11 kHz, so bright recorded
takes do not read as shrill next to the music.

### Recipes

A `SynthRecipe` is a list of `SynthLayer`s mixed into one 22 kHz mono buffer (`SYNTH_RATE` = 22050): a waveform `w`
(`sine`, `square`, `tri`, `saw`, `noise`), a pitch swept exponentially from `f[0]` to `f[1]`, a length `t` and delay
`d` in seconds, an attack `at`, a gain `g`, a decay exponent `c` (1 linear, higher falls away faster), a square's
`duty`, and one-pole low- and high-pass cutoffs swept over the layer (`lp`, `hp`). Noise with `f` is sample-and-hold
at that rate, which crunches. The result is normalised under full scale, so a recipe never clips.

`renderRecipe(recipe)` returns the `Float32Array`; it is pure, so a test or an offline tool can render one without
an `AudioContext`.

### Volume

```ts
import { engineSettings } from '1681-engine';

engineSettings.set({ sfxVolume: 0.6, musicVolume: 0.4 }); // both 0–1; defaults 0.8 and 0.6
```

The engine never reads the game's own settings store: mirror the fields into `engineSettings` whenever the player
changes them. [`examples/platformer/PauseScene.ts`](/examples#platformer) does it from a volume `Slider`, and
[`examples/platformer/main.ts`](/examples#platformer) registers its four recipes.

## Music

```ts
import { music } from '1681-engine';

music.configure({ route: 'auto', pauseInBackground: true }); // before the first track

music.play('music/forest.ogg'); // the 'music' channel, crossfaded over 1200 ms
music.channel('ambience').play('amb/wind.ogg', { volume: 0.5 }); // a second layer under it
music.play('music/boss.ogg', { fadeMs: 600 }); // crossfades the 'music' channel only
music.channel('ambience').play('amb/wind.ogg', { volume: 0.3 }); // same track: only its level changes
music.stop(2000); // fades every channel out
```

- `channel(name = 'music')` returns a `MusicChannel`, made on first use. Each channel plays one track at a time; its
  level is the track's own `volume` × `engineSettings.musicVolume`.
- `PlayOptions`: `fadeMs` (crossfade, default 1200), `loop` (default true), `volume` (0–1, default 1). Playing the url
  already playing does not restart it.
- `music.current` is the url on the `'music'` channel. `pause()` stops every channel where it is and `resume()` picks
  them up again; `destroy()` disposes every channel and closes the audio graph.
- **Routes** (`MusicRoute`): `'element'` fades the `<audio>` element's own volume, nothing in between. `'graph'`
  routes the element through a Web Audio gain, the only way where `volume` is read-only (iOS). `'auto'` (the default)
  uses the graph only where `elementVolumeLocked()` says it must.
- `pauseInBackground` stops the music while the page is hidden; by default it is on for touch devices only.

## Footsteps

`Footsteps` turns a step at a world point into the sound of the ground there:

```ts
import { Footsteps } from '1681-engine';

const steps = new Footsteps({
  sounds: {
    grass: { step: 'step_grass' },
    stone: { step: 'step_stone', hoof: 'hoof_stone' },
    wood: { step: 'step_wood' },
  },
  fallback: 'grass',
  gain: 0.5, // default
  range: 200, // default: nobody else's steps are heard past this
});

// what a point is made of: here a Tiled tile property
steps.setSurfaceAt((x, y) => surfaceOfTile(Math.floor(x / 16), Math.floor(y / 16)));

// on each beat of the walk cycle
steps.step(hero.x, hero.y, true); // the player's own
steps.step(rider.x, rider.y, false, true); // a mount: `hoof`, else `step`
```

A step plays through `sound` with `minor: true`, so it is the first thing dropped when the mix is busy. An unknown
surface falls back to `fallback`'s sounds. The sound names are ordinary `registerSounds` recipes or takes.

## Pitfalls

- **Nothing plays before the first gesture.** The `AudioContext` is made inside the first pointer, touch or key event,
  and `sound.play` while it is not running is dropped, not queued. Music is queued instead: a refused start is retried
  on the next gesture.
- **iOS** counts `touchend`, not `pointerdown`, as a gesture, and leaves the context interrupted after the app comes
  back from the background. The engine listens again while the context is not running, and sets the audio session to
  `ambient`, so sound follows the silent switch and mixes with the player's own music.
- **Without a listener, positions do nothing.** `sound.listener` returns null by default; a sound with `x`/`y` then
  plays centred and unmuffled, at the 0.45 weight unless `local`. Set it when a world scene starts and reset it to
  `() => null` when it ends.
- **Take file names must be lower-case letters and underscores**, ending `.mp3`. `Hit.mp3` or `hit2.mp3` is silently
  ignored, and `hit_2.mp3` is a take of `hit`, not a sound named `hit_2`.
- **A take-only sound is silent until it decodes.** A sound with takes but no recipe has no fallback; the first plays
  of a fight can be missed. Decoding starts for every take when the context first runs, and each take is cleaned
  (mono, silence trimmed, one loudness) in a worker, handed over one per task so no frame freezes. Since takes are
  levelled on decode, a recipe's `fileGain` is the only mix knob for them.
- **The 60 ms gap is per name, for everyone.** A distant monster's `hit` swallows the player's own `hit` 30 ms later.
  Give the player's sounds their own names if that matters.
- **`range` only shrinks hearing.** It cannot reach past 480 px, and the muffle is reckoned against 480 px, not against
  `range`.
- **Graph-routed music from another origin plays silent** unless it is served with CORS headers. Serve tracks from the
  game's own origin, or force `route: 'element'` where volume works.
- **`configure` after the first track** applies only to tracks started later; a track already playing keeps its
  route.
- **Element fades run on `requestAnimationFrame`.** In a hidden tab a crossfade stalls and the old track keeps playing
  until frames come back; graph fades are scheduled on the audio clock and finish anyway. Turn `pauseInBackground` on
  for the desktop if that matters.
