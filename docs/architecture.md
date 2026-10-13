# Architecture

## One frame

```
Pixi ticker ──▶ Stage.frame(delta)
                 ├─ sync size (resize listeners)
                 ├─ update ──▶ Engine.tick
                 │              ├─ FixedLoop.advance(delta)
                 │              │    └─ per step: world.run('fixed') → scene.fixedUpdate(dt)
                 │              ├─ world.run('frame') → scene.update(dt, alpha)
                 │              └─ events.emit('frame')
                 ├─ tweens
                 ├─ timers
                 └─ camera (follow, shake, snap)
Pixi renders
```

Every step of `Stage.frame` is **guarded**: a throw is logged once per distinct message, reported on
`engine.events` (`'error'`), and the steps after it still run. A ticker listener that throws never asks for the next
frame, so without the guard one bad frame stops the game for good.

## Modules

| Folder | Depends on | Holds |
|---|---|---|
| `engine/` | `core`, `ecs`, `events` | `Engine`, `Scene`, `SceneManager`, `FixedLoop` |
| `ecs/` | — | `World`, components, systems |
| `events/` | — | `EventBus` |
| `core/` | pixi.js | `Stage`, `Camera`, display objects, `PixelLayer`, textures, atlas |
| `art/`, `art/rig/` | — (pure pixel maths) | colours, ramps, outlines, the rig's bones and pose maths |
| `fx/` | `core`, `art` | `pixelPaint`, `pixelTone`, `Evaporation`, hit feel |
| `light/` | `core` | `Darkness`, transient lights |
| `audio/` | Web Audio | `sound`, synth, sample bank |
| `input/`, `platform/` | DOM | keyboard, sticks, touch detection |
| `net/` | — (pure) | movement, snapshot codec, cadence, server clock |

`ecs/`, `events/`, `net/` and most of `art/` import nothing from Pixi or the DOM, so they run under node: that is
where the unit tests live, and where a server can import the movement code from.

## Rules that keep it fast

These came from profiling a real game on phones; keep to them when you add code.

1. **Paint whole world pixels.** Effects, lights and bodies are drawn on the 1-px world grid and snapped there. A
   sprite scaled by a fraction lands 2.94 pixels at one size and 3 at the next, and reads as a different art style.
2. **Batch pixels into one texture.** A `PixelLayer` writes rects into a pooled buffer uploaded once a frame;
   thousands of single-pixel `Graphics` rects were most of a fight's CPU on a phone.
3. **Never block a frame with a one-off job.** Pure work (decoding and cleaning audio, painting large ground) goes to
   a worker; work that must touch the main thread is handed over one item per task (`setTimeout(…, 0)`). Fonts and
   light falloffs are made ahead (`installLabelFont`, `Darkness`' warm-up).
4. **Pool, don't create.** Textures, filters and buffers are pooled or shared. A texture per effect ran to a hundred a
   second and leaked through Pixi's batch tables (`core/pixiPatches.ts` fixes Pixi's own leak).
5. **Guard every step, report every error once.** See "One frame" above.
6. **Lists walked every frame are never mutated while walked.** `World` defers destruction to the end of a run;
   `EventBus` replaces its listener list instead of editing it.

## Determinism

`net/movement.ts` is written so a port in another language gives the same doubles: the operation order is fixed,
`DIAGONAL` is a literal, and nothing reads the clock. A client predicts with it and replays unacknowledged steps after
each snapshot; a server runs it as the authority. Run movement only in `fixed` systems, with the same `MovementParams`
on both sides.

`net/snapshotCodec.ts` packs a body's state (`[id, x, y, aim, anim, hp, flags]`) into 16 bytes: position to 1/8 px,
aim to 1/256 of a turn. `quantizeUpdates` applies the same rounding without the bytes, for a local simulation that
must move on the same grid the server sends.
