# Post-processing

`1681-engine/postfx` lays full-screen effects over a game: a chain of filters on the whole picture (or the world layer
alone, so the HUD stays sharp), switched on and off one by one, and short effects that come and go — a flash, a
shockwave, any number animated over time. Every effect is written for both renderers (GLSL for WebGL 2, WGSL for
WebGPU) and draws at the canvas's own resolution, so a pixel game's effects land on its pixels.
[`examples/physics-toys`](/examples#physics-toys) has every one of them on a key.

```ts
import { BloomFilter, PostFx, VignetteFilter } from '1681-engine/postfx';

const post = PostFx.forEngine(engine); // over everything; { layer: 'world' } leaves the HUD alone
post.add(new BloomFilter({ threshold: 0.75, intensity: 1 }));
const vignette = post.add(new VignetteFilter({ strength: 0.4 }));

post.flash({ color: 0xffffff, strength: 0.5, ms: 120 }); // a hit
post.shockwave(screenX, screenY, { amplitude: 16, ms: 600 }); // an explosion, at a point in screen pixels
post.animate((v) => (vignette.strength = v), 0.4, 0.8, 300, 'Sine.InOut'); // a heartbeat
post.setEnabled(vignette, false);
```

`forEngine` steps the animations on the engine's frames and, over the whole picture, fills the screen behind it with the
renderer's background (an effect only sees what is drawn: without that backdrop the empty background would stay untouched by a
vignette or a flash). Effects apply in the order added; the shockwaves `shockwave` makes go first, so a CRT's curve bends
them too. `destroy()` takes everything off.

## The effects

| Effect | What | Knobs |
|---|---|---|
| `VignetteFilter` | darkens the edges towards a colour (red for low health) | `strength`, `radius`, `softness`, `color` |
| `BloomFilter` | bright things glow: a bright pass, a blur, added back | `threshold`, `knee`, `intensity`, `blur`, `quality` |
| `ColorAdjustFilter` | brightness, contrast, saturation, a tint, and the flash | `brightness`, `contrast`, `saturation`, `tint`/`tintAmount`, `flash`/`flashColor` |
| `ChromaticAberrationFilter` | red and blue split towards the edges | `offset` (px at a corner) |
| `CrtFilter` | scanlines, a bulging glass, darker corners | `scanlines`, `lineHeight`, `curvature`, `cornerShade` |
| `PixelateFilter` | the picture in blocks | `size` (px) |
| `ShockwaveFilter` | a ring that bends the picture as it passes | `centerX/Y` (`setCenter`), `radius`, `width`, `amplitude` |

Bloom is three passes on textures from Pixi's pool; the others are one pass each. On a phone, keep the chain short and
put bloom on the world layer only.

`flash` and `shockwave` are skipped while the player asked for reduced effects (`engineSettings.reducedFx`), unless
`PostFx` is made with `honourReducedFx: false`. The lasting effects stay: a vignette or a colour grade is a look, not
a flash.

## Writing an effect

`FxFilter` builds a filter from one spec: its uniforms, and the body of its fragment function in GLSL and WGSL. Both
bodies are handed the same helpers, so the two read alike: `frameUv` (0–1 across the filtered area), `framePx` (its
size), `texel` (one input pixel), `coord` and `src` (this fragment's coordinate and colour, premultiplied),
`sampleAt(coord)` (clamped inside the area) and `toCoord(uv)`. Write `result`.

```ts
import { FxFilter } from '1681-engine/postfx';

class SepiaFilter extends FxFilter {
  constructor(amount = 1) {
    super({
      name: 'sepia',
      uniforms: { uAmount: { type: 'f32', value: amount } },
      glsl: `
  vec3 s = vec3(dot(src.rgb, vec3(0.393, 0.769, 0.189)), dot(src.rgb, vec3(0.349, 0.686, 0.168)), dot(src.rgb, vec3(0.272, 0.534, 0.131)));
  result = vec4(mix(src.rgb, s, uAmount), src.a);`,
      wgsl: `
  let s = vec3<f32>(dot(src.rgb, vec3<f32>(0.393, 0.769, 0.189)), dot(src.rgb, vec3<f32>(0.349, 0.686, 0.168)), dot(src.rgb, vec3<f32>(0.272, 0.534, 0.131)));
  result = vec4<f32>(mix(src.rgb, s, fx.uAmount), src.a);`,
    });
  }
}

post.add(new SepiaFilter(0.8)).set('uAmount', 0.5);
```

GLSL reads a uniform by its name; WGSL through `fx.<name>`. Uniforms may be `f32`, `vec2<f32>`, `vec3<f32>` or
`vec4<f32>`; `set(name, ...values)` writes one. An effect that samples a second texture (bloom's blurred light) sets
`map: true` and gets `uMap` / `sampleMap`.

Any Pixi `Filter` can go into the chain as well: Pixi's own `BlurFilter`, `NoiseFilter`, `ColorMatrixFilter`, or
the `pixi-filters` package's.
