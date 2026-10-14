# Platform: fullscreen, orientation, rumble

Small helpers over browser APIs that differ between platforms. Every one is a safe no-op where the API is missing or
refused: the calls that ask for something resolve `false` instead of throwing, so a game asks once and falls back.

## Pausing in the background

```ts
const engine = await Engine.create({ parent, pauseWhenHidden: true, followReducedMotion: true });
```

`pauseWhenHidden` stops simulating and drawing while the page is hidden (another tab, the phone's home screen) and
resumes when it is shown. The time away is not owed: the fixed loop starts again with no debt, so there is no burst
of steps on return. A pause the game made itself (`engine.pause()`) is left alone when the page comes back.
`HiddenPause` is the rule on its own, for a loop that is not the engine's.

## Reduced motion

```ts
import { prefersReducedMotion, onReducedMotionChange, followReducedMotion } from '1681-engine';

const shake = prefersReducedMotion() ? 0 : 1;
const off = onReducedMotionChange((reduced) => …);
```

`followReducedMotion()` (or the engine option of the same name) mirrors the system setting into
`engineSettings.reducedFx`, now and on every change. Leave it off when your game has its own "reduced effects"
toggle — mirror that store instead, or the system will overwrite the player's choice.

## Fullscreen

```ts
import { toggleFullscreen, fullscreenSupported, onFullscreenChange } from '1681-engine';

button.visible = fullscreenSupported(); // never on iPhone Safari
button.onPress = () => toggleFullscreen(); // must run inside a gesture
onFullscreenChange((on) => button.setLabel(on ? 'Window' : 'Fullscreen')); // Esc included
```

`enterFullscreen(element?)` (default the whole page), `exitFullscreen()`, `isFullscreen()`. Older Safari's `webkit`
names are used where the standard ones are missing.

## Orientation

```ts
if (!(await lockOrientation('landscape'))) showTurnYourPhoneHint();
```

Android Chrome allows a lock only in fullscreen or as an installed app; desktop browsers and iPhone Safari refuse. Both
resolve `false`. `unlockOrientation()` lets it turn again; `currentOrientationKind()` is `'landscape'`, `'portrait'`
or null.

## Gamepad rumble

```ts
import { rumble } from '1681-engine';

rumble(0, { strong: 0.8, weak: 0.3, durationMs: 150 }); // pad 0 of navigator.getGamepads()
actions.rumble({ weak: 0.4, durationMs: 80 }); // every pad the actions read, or one: actions.rumble(opts, 1)
```

Through `vibrationActuator.playEffect('dual-rumble')`; magnitudes are clamped to 0–1 and the duration to 5 s.
`stopRumble(padIndex)` cuts it short.

## Pointer lock

```ts
const pointer = engine.stage.input.activePointer;
engine.app.canvas.addEventListener('click', () => pointer.lock({ raw: true }));
// each step:
const { x, y } = pointer.takeMovement(); // mouse travel since the last call
```

`Pointer.lock` hides the cursor and sums `movementX/Y` while locked (`x`/`y` stay where it was locked); `raw` asks for
unaccelerated movement and falls back where the browser refuses. The player can always leave with Esc, so follow
`onPointerLockChange` (or read `pointer.locked`) rather than assuming it holds. The plain helpers are
`requestPointerLock(element)`, `exitPointerLock()` and `isPointerLocked()`.
