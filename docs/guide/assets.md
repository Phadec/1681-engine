# Assets

`AssetLoader` loads what a scene needs before it starts. Queue assets, then `await load()`; every kind shares the same
progress callback and the same number of requests at once (`concurrency`, default 6). A failed asset fails the whole
load with its URL in the message.

```ts
import { AssetLoader } from '1681-engine';

const assets = new AssetLoader(this.engine.stage.textures, { baseUrl: 'assets/' });
assets
  .image('logo', 'logo.png')
  .spritesheet('hero', 'hero.png', { frameWidth: 16, frameHeight: 16 }) // frames 0, 1, 2…
  .atlas('props', 'props-0.json') // TexturePacker JSON, multipack included
  .font('Body', 'fonts/body.woff2', { weight: '400' })
  .audio('door', 'sfx/door.ogg')
  .tilemap('map', 'map.tmj')
  .json('tuning', 'tuning.json');
await assets.load(({ done, total }) => bar.set(done / total));
```

## Texture atlases

`atlas(key, url)` reads TexturePacker's "JSON (Hash)" and "JSON (Array)" exports — the files Pixi's own `Spritesheet`
reads. Every frame is registered under `key` by its name, whichever page holds it:

```ts
new Image(stage, x, y, 'props', 'barrel.png');
const { frames, animations } = assets.getAtlas('props');
```

- **Multipack.** When `meta.related_multi_packs` names other pages, each is fetched (resolved beside the file that
  names it, once however the pages name each other) and loaded as `props~1`, `props~2`…, the same page naming
  `AtlasBuilder` uses. A frame name on two pages is warned about; the later one wins.
- **Trimmed and rotated frames** keep their untrimmed size and are turned back, so they line up when drawn.
- **Animations** in Pixi-flavoured JSON (`animations: { walk: [...] }`) come back from `getAtlas`.
- An atlas counts as one asset in the progress, however many pages it has.

The parser is pure and exported (`parseAtlas`, `collectAtlasPages`) for tools that want to read atlases themselves.

## Painting ahead: `Prepainter`

A big texture painted from data (a map's whole ground) is seconds of work on a phone. `Prepainter` paints the ones a
player may need next in a worker while they play, and frees the ones they walked away from:

```ts
import { Prepainter, workerPainter } from '1681-engine';

const ahead = new Prepainter<MapData>({
  textures: stage.textures,
  id: (m) => m.id,
  key: (id) => `ground_${id}`,
  painter: workerPainter({ create: () => new Worker(new URL('./groundWorker.ts', import.meta.url), { type: 'module' }), message: (map) => ({ map }) }),
});
ahead.enter(current, mapsBeyondItsDoors);
```

The worker answers `{ id, w, h, pixels }` (RGBA, the buffer transferred) for each request. Whatever is not ready on
arrival is still painted there by the game; `painting(id)` tells whether waiting a moment is worth it.

## Fonts

`font(family, url, descriptors?)` loads a web font into a `FontFace` and adds it to `document.fonts`. Load fonts before
the first `Text` is drawn with them, or that text measures itself with the fallback font. The progress key is the
family name. Pass `addFont` in the loader's options to install fonts some other way.

## Audio

`audio(key, url)` decodes a sound file into an `AudioBuffer` through the engine's audio context (`sound.audioContext`,
or the `audioContext` option). Browsers open an audio context only after a gesture, and a loading screen should not
wait for one: before a context exists the bytes are kept, `getAudio(key)` returns null, and `decodeAudio(key)`
decodes them once one does (concurrent calls share one decode).

```ts
const buffer = assets.getAudio('door') ?? (await assets.decodeAudio('door'));
```
