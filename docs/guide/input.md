# Input

[Getting started](getting-started.md#_7-input-actions) introduced `Actions`: named actions bound to keys, gamepad
buttons and sticks, and touch buttons. This page covers what sits around it: key chords, a rebindable `Keymap`,
dropping stale presses when a menu closes, and the touch helpers `AimGesture` and `TargetLock`.

## Key chords

A binding may be a chord: modifiers, then a `KeyboardEvent.code`. `Shift`, `Ctrl`, `Alt` and `Meta` each match either
side of the keyboard.

```ts
import { Actions, Keyboard } from '1681-engine';

const input = new Actions(new Keyboard(), {
  next: ['Tab'],
  prev: ['Shift+Tab'],
  save: ['Ctrl+KeyS', 'Meta+KeyS'],
  run: ['ShiftLeft'],
  jump: ['Space'],
});
```

A chord wins over its bare key: while `Shift+Tab` is held, `next` (plain `Tab`) is off, and it stays off until Tab
itself comes up, so letting Shift go first never turns a Shift+Tab into a Tab. A bare key held with a modifier no chord
names still counts: holding Shift to run does not stop the jump key. `parseChord` and `chordHeld` are the same rule
for code of your own, and `keyLabel('Shift+Tab')` prints it for a hint on screen.

## Rebinding with `Keymap`

`Keymap` is the table of which keys each action sits on, as the player has rebound them. The input, the key hints and a
settings screen all read it.

```ts
import { Actions, Keyboard, Keymap, keyLabel, keymapStorage } from '1681-engine';

type Act = 'left' | 'right' | 'jump' | 'pause';

const keymap = new Keymap<Act>(
  { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], jump: ['Space', 'KeyW'], pause: ['KeyP'] },
  undefined, // reserved keys: the default, Escape, Enter and Tab
  { left: ['pad:left', 'pad:lx-'], right: ['pad:right', 'pad:lx+'], jump: ['pad:a'], pause: ['Escape', 'pad:start'] },
);
const storage = keymapStorage('my-game.keys');
keymap.load(storage.read());

const actions = new Actions<Act>(new Keyboard(), { left: [], right: [], jump: [], pause: [] });
keymap.applyTo(actions);
keymap.onChange(() => {
  keymap.applyTo(actions);
  storage.write(keymap.toJSON());
});

// a settings screen: the next key pressed goes on Jump
const lost = keymap.bind('jump', 'KeyJ'); // the actions that lost KeyJ, or null for a reserved key
hint.text = `Jump: ${keyLabel(keymap.keysFor('jump')[0] ?? '-')}`;
```

The rules it keeps:

- **One key, one action.** `bind` takes the key off whatever held it and returns those actions, so you can tell the
  player ("That key was taken from: Left").
- **Reserved keys are never taken.** Escape, Enter and Tab belong to the interface by default; `bind` refuses them and
  returns `null`.
- **Fixed inputs** (the third argument) are the ones the player does not rebind: the gamepad, touch buttons, and a
  reserved key an action should still answer to, such as Escape for pause. `applyTo` lays them after the player's keys;
  they are never saved and neither rule above applies to them. `fixedFor(action)` lists them.
- **A settings screen edits the first key** of an action and leaves the alternates alone.
- **Old saves are safe.** `load` reads only actions this build knows and ignores anything malformed; a new action keeps
  its defaults where no saved action holds those keys.

`applyTo` binds only the keymap's own actions, so the `Actions` may hold more (menu actions on fixed inputs alongside
the rebindable ones). [`examples/platformer/Controls.ts`](/examples#platformer) is a whole controls module: one keymap
for the game, saved the moment it changes and handed to whichever `Actions` the running level owns.

::: tip Capturing the key to bind
Listen for the next `keydown` on `window` in the **capture** phase and stop it there, so neither the menu's `Keyboard`
nor the level's sees the key being chosen. The platformer's pause menu does exactly that.
:::

## Stale presses: `Actions.flush` and `Scene.useInput`

While a pause menu sits over a level, the level's `Actions` is not polled. A key pressed in the menu would otherwise
arrive as a press the moment the level resumes, and the Escape that closed the menu would pause it again.

```ts
class Level extends Scene {
  private readonly keyboard = new Keyboard();
  // registered with the scene: flushed when a scene pushed over this one pops, before onResume
  private readonly input = this.useInput(new Actions(this.keyboard, BINDINGS));
}
```

`flush()` forgets every pending edge: what went down or up since the last step is dropped, and what is held now counts
as already held, so the next `poll` reports no `pressed` or `released` for it. Call it yourself for input that sat
unread for any other reason.

`Scene.delay(ms, fn)` is the timer to use from a scene for the same reason: its timers are cancelled when the scene
exits, while `stage.time.delayedCall` timers belong to the stage and fire after the scene has gone.

::: warning A `Keyboard` knows only keys pressed after it was made
A key already held when a scene builds its `Keyboard` reads as up until it is pressed again. Destroy the keyboard in
`onExit` (`keyboard.destroy()`), or its window listeners stay.
:::

## Drag to aim: `AimGesture`

The MOBA way of aiming a skill on a touch screen: pressing the skill button opens a circle round it with a knob under
the thumb, and where the knob sits is where the skill goes. `AimGesture` is the pure state of one press; the game draws
the circle and reads the result.

```ts
import { AimGesture, aimPoint, type AimShape } from '1681-engine';

const blast: AimShape = { kind: 'point', range: 96 }; // or { kind: 'direction', length: 120 } for a shot or a dash
let gesture: AimGesture | null = null;
let downAt = 0;

button.addEventListener('pointerdown', () => {
  gesture = new AimGesture({ radius: 90, centreCancels: !hasCancelZone });
  downAt = performance.now();
});
window.addEventListener('pointermove', (e) => {
  if (!gesture) return;
  gesture.move(e.clientX - buttonX, e.clientY - buttonY, overCancelZone(e), performance.now() - downAt);
  if (gesture.aiming) showAim(aimPoint(hero, blast, gesture.share, hero.aim)); // { aim, x, y }
});
window.addEventListener('pointerup', () => {
  const end = gesture?.up(); // 'tap' | 'cast' | 'cancel'
  if (end === 'tap') castAtTarget(); // a tap: the locked target, the nearest enemy, the facing
  else if (end === 'cast') castAt(aimPoint(hero, blast, gesture!.share, hero.aim));
  gesture = null;
});
```

- A press that never wanders past the tap slop (10 px) is a **tap**. In its first `pressMs` (180 ms) the slop is
  longer (28 px): a hard press slides as it lands, and a quick tap that slid became a drag that flew wherever the slide
  pointed.
- Letting go over the cancel zone casts nothing. Letting go with the knob back on the button casts as a tap, or
  cancels with `centreCancels` (the only way to cancel when there is no zone).
- `cancelling` is true while letting go now would cast nothing: light the cancel zone with it.
- A point skill's reach runs from the edge of the centre ring to the rim (`spotReach`), so a knob just out of the ring
  lands at the caster's feet. `spotShare` is the inverse, for aim assist and replays.

## Holding a target: `TargetLock`

Dragging an attack button points at a body; a target button picks the nearest. The lock then holds, and every attack,
skill and the facing goes at it even while a stick walks the body elsewhere, until that body is gone or leaves
`keepRange`.

```ts
import { TargetLock } from '1681-engine';

const lock = new TargetLock(() => enemies.map((m) => ({ id: m.id, x: m.x, y: m.y })), { pickRange: 220, keepRange: 300 });

lock.pick(hero, { x: dragX, y: dragY }); // what the drag points at; pointing at nothing keeps the old lock
lock.pickNearest(hero); // the target button
const target = lock.current(hero); // the held body while it still holds, else null (and the lock is dropped)
```

A drag scores bodies by how far off its line they stand, with distance as a lighter second weight, so a far body dead
ahead beats a near one off to the side; nothing outside the cone (50° each side) is picked. `nearestTarget` breaks a
tie on the lower id, so two clients pick alike. The callback decides what may be locked: monsters, a duel's opponent.

### Drawing the aim: `PixelMarks`

`1681-engine/pixel` draws the marks in world pixels: lock rings, ground ellipses at a body's feet, spot discs, and aim
lines as rows of chevrons — never a solid lane, which at most angles is a staircase of pixels and reads as broken.
Shapes are painted once per size and tone and only moved; chevrons come from a pool, repainted only when their
heading bucket changes.

```ts
import { PixelMarks } from '1681-engine/pixel';

const tone = { light: 0xffb0a0, rim: 0xff5a4a, dark: 0x2a0806, fill: 0xff4a3a };
const marks = new PixelMarks(stage, { tones: { aim: { ...tone, light: 0xffe9a8, rim: 0xffc84a }, lock: tone }, depth: 10 });

marks.begin();
const target = lock.current(hero);
if (target) marks.groundRing(target.x, target.y, 12, 6, 'lock');
marks.chevrons(now, hero.x, hero.y, aimAngle, 12, 90, 4, 'aim'); // creeping along the line
marks.end(); // hides whatever was shown last frame and not this one
```

The pixel shapes underneath are pure and exported: `ringPixels`, `discRuns`, `ellipsePixels`, `chevronPixels`.

## Haptics

`Haptics` buzzes a phone per kind of moment, at most once per kind's gap, so six bodies struck by one cleave are one
buzz. The default player is `navigator.vibrate`; a native shell hands in its plugin:

```ts
const haptics = new Haptics<'crit' | 'hurt'>({ gaps: { crit: 120, hurt: 300 }, enabled: () => settings.haptics });
haptics.buzz('crit');
```

## Touch detection

`isTouchUi()` says whether the game is played with fingers, decided once per launch (`detectTouch`): a native shell,
or a browser whose primary pointer is coarse. `?touch=1` or `?touch=0` in the URL forces it for testing, and so does a
`localStorage` key the game names with `setTouchOverrideKey('my-game.touch')` (`'1'`/`'0'`). A native wrapper
(Capacitor, an Electron kiosk) calls `setNativeShell(true)` before anything asks.

## API

[`Actions`](/api/index/classes/Actions) · [`Keymap`](/api/index/classes/Keymap) ·
[`keymapStorage`](/api/index/functions/keymapStorage) · [`keyLabel`](/api/index/functions/keyLabel) ·
[`parseChord`](/api/index/functions/parseChord) · [`Scene.useInput`](/api/index/classes/Scene#useinput) ·
[`AimGesture`](/api/index/classes/AimGesture) · [`aimPoint`](/api/index/functions/aimPoint) ·
[`TargetLock`](/api/index/classes/TargetLock) · [`isTouchUi`](/api/index/functions/isTouchUi)
