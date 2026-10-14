# UI

`1681-engine/ui` is the UI module, in three layers a game takes as much of as it wants:

- **Canvas widgets**: a HUD and menus drawn by Pixi on the stage's screen layer, driven by mouse, touch, keyboard and
  gamepad: `UiRoot`, `Panel`, `Button`, `Label`, `RichText`, `Bar`, `Slider`, `Toggle`, `Stack`, `ScrollView`, `List`, `Dialog`.
- **Layout maths**: pure functions both the widgets and a DOM UI use (`stackLayout`, `anchorPosition`,
  `fitToViewport`, `placeTooltip`, …), tested under node.
- **The DOM/React bridge**: an HTML layer laid exactly over the canvas (`DomOverlay`), elements that follow world
  points (`DomWorldAnchors`), a tiny store between game and UI (`createStore`), and `InputShield`, which keeps typing in
  a text field from walking the hero.

A UI written in React uses the bridge and the [React kit](react.md) on top of it. A game that draws no UI through the
engine never ships any of this.

## A HUD

```ts
import { Bar, Label, Panel, Stack, UiRoot } from '1681-engine/ui';

class Level extends Scene {
  private ui!: UiRoot;
  private health!: Bar;
  private coins!: Label;

  override onEnter() {
    this.ui = new UiRoot(this.engine.stage, { parent: this.hud }); // goes when the scene does
    this.coins = Label.text('Coins 0', { fontFamily: 'monospace', fontSize: 16, color: '#efe6ff' });
    this.health = new Bar({ width: 120, height: 6, color: 0xd04040, value: 1 });
    const column = new Stack({ gap: 4, padding: 6 }).add(this.coins, this.health);
    const back = new Panel({ color: 0x14101c, alpha: 0.7 }, column.boxWidth, column.boxHeight, { blocksPointer: false });
    back.addChild(column);
    this.ui.pin(back, 'top-left', 8); // stays in the corner through every resize
  }

  hurt(hp: number, max: number) {
    this.health.setValue(hp / max); // the loss shows as a trail that holds, then drains
  }
}
```

`pin(child, anchor, margin)` keeps a piece at one of nine anchors (`'top-left'`, `'top'`, … `'center'`, …
`'bottom-right'`), `margin` in from the edges: a number, or per side for a phone's notch. When a pinned piece changes
size (a longer text), call `ui.layout()` to place it again; resizes do it by themselves.

Every widget has a **layout box** (`boxWidth` × `boxHeight`), its own units rather than its drawn bounds, which is
what stacks and pins read. Under a pixel-perfect engine (`pixelPerfect: true`) the root lays everything out on whole
pixels.

## Skins

A skin is a 9-slice texture, or a plain colour box while a game has no art yet:

```ts
import type { ButtonSkin, PanelSkin } from '1681-engine/ui';

const WINDOW: PanelSkin = { color: 0x1c1628, border: 2, borderColor: 0x6a5a90, alpha: 0.96 };
const FRAME: PanelSkin = { texture: textures.get('ui_frame'), insets: { left: 6, top: 6, right: 6, bottom: 6 } };

const BUTTON: ButtonSkin = {
  normal: { color: 0x2a2340, border: 2, borderColor: 0x5a4c80 },
  hover: { color: 0x3a3058, border: 2, borderColor: 0x8a78c0 },
  pressed: { color: 0x1c1830, border: 2, borderColor: 0x8a78c0 },
  focus: { color: 0, fillAlpha: 0, border: 2, borderColor: 0xffd98a }, // a bare ring over whichever face shows
  pressOffset: 1, // a pressed face is the same face a pixel lower
};
```

`fillAlpha: 0` draws only the border, which is how a focus ring is made. Swapping colour skins for texture skins
changes nothing else: [`examples/platformer/uiSkin.ts`](/examples#platformer) is all colour boxes.

## Menus with keyboard and gamepad focus

The root owns focus. It reads navigation from any input with `pressed(action)` (an `Actions`), by default the actions
`ui_up`, `ui_down`, `ui_left`, `ui_right`, `ui_accept`, `ui_cancel`, `ui_next` and `ui_prev`.

```ts
import { Actions, Keyboard } from '1681-engine';
import { Button, Dialog, Label, Slider, Stack, UiRoot } from '1681-engine/ui';

const UI_BINDINGS = {
  ui_up: ['ArrowUp', 'pad:up', 'pad:ly-'],
  ui_down: ['ArrowDown', 'pad:down', 'pad:ly+'],
  ui_left: ['ArrowLeft', 'pad:left', 'pad:lx-'],
  ui_right: ['ArrowRight', 'pad:right', 'pad:lx+'],
  ui_accept: ['Enter', 'Space', 'pad:a'],
  ui_cancel: ['Escape', 'pad:b', 'pad:start'],
  ui_next: ['Tab'],
  ui_prev: ['Shift+Tab'],
};

class PauseMenu extends Scene {
  private readonly keyboard = new Keyboard();
  private readonly input = new Actions(this.keyboard, UI_BINDINGS);
  private ui!: UiRoot;

  override onEnter() {
    this.ui = new UiRoot(this.engine.stage, { parent: this.hud });
    const resume = new Button({ width: 200, height: 30, skin: BUTTON, content: Label.text('Resume', FONT), onClick: () => dialog.close() });
    const volume = new Slider({ width: 150, height: 14, track: TRACK, knob: KNOB, step: 0.05, value: 0.8, onChange: setVolume });
    const body = new Stack({ gap: 8, align: 'center' }).add(Label.text('Paused', TITLE), resume, volume);
    // no height: the dialog takes its content's, padding included
    const dialog = new Dialog({ width: 260, frame: WINDOW, content: body, padding: 16, onClose: () => void this.engine.scenes.pop() });
    dialog.open(this.ui);
    this.ui.focus.focus(resume);
  }

  override onExit() {
    this.keyboard.destroy();
  }

  override fixedUpdate() {
    this.input.poll();
    this.ui.handleInput(this.input); // true when the UI used a press
    this.input.endStep();
  }
}
```

- Directions move **spatially** to the nearest widget that way (one straight ahead beats a nearer one off to the
  side); a focused slider uses left and right itself. Tab and Shift+Tab step in tree order. Accept activates; Cancel
  asks the innermost scope.
- A `Dialog` dims the screen and eats presses on it, traps focus inside until it closes, and closes on Cancel or a
  press outside (unless `dismissable: false`). It is centred and kept inside the screen however small it gets: shrunk,
  never below its whole scale under pixel art.
- In a level with a HUD that can take focus, call `handleInput` first and leave the game's own actions alone when it
  returns true or `ui.capturesInput` is set (a modal is open or a widget has focus).
- After adding, removing, hiding or disabling widgets by hand, `ui.invalidateFocus()` collects them again; `Stack` and
  `List` do it for you.

The platformer's [`PauseScene`](/examples#platformer) is a complete menu: resume, restart, language, a volume slider
and a "press a key" rebind, by mouse, keyboard or gamepad.

## The widgets

| Widget | What |
|---|---|
| `Panel` | a framed box, the background of everything else; `blocksPointer` (default true) keeps presses on it from the world |
| `Label` | text, `Label.text(value, style)` (a canvas `Text`, any font) or `Label.bitmap(…)` (a `BitmapLabel`, cheap to change) |
| `RichText` | text with inline markup — colour, bold, size, icons — wrapped and aligned; see [Rich text](rich-text.md) |
| `Button` | normal, hover, pressed, disabled and focus faces; `content` centred on it |
| `Bar` | health or progress with a delayed drain: a loss shows as a trail that holds, then drains; `setValue(v, true)` drops it at once |
| `Slider` | dragged anywhere on its track, stepped by left/right when focused; `min`, `max`, `step` |
| `Toggle` | a checkbox: a press, Accept, or left/right flips it |
| `Stack` | children one after another, down or across, with `gap`, `padding`, `align` (`start`, `center`, `end`, `stretch`) and `crossSize` |
| `ScrollView` | content clipped and scrolled by wheel, drag with fling, and to whatever is focused |
| `List` | rows in a scroll view, stretched to its width, followed by the focus |
| `Dialog` | a modal window, above |

A HUD number rewritten every frame should be a bitmap label: a canvas `Text` repaints and uploads its texture on every
change. `Label.setText` with the same string costs nothing, so setting it every frame is fine.

## Pitfalls

- **Give `UiRoot` the scene's `hud` as `parent`.** It then dies with the scene, its ticker listener and resize hook
  with it. On the default (the stage's screen layer) it outlives the scene that made it until you call `destroy()`.
- **`label` is a taken name.** A widget is a Pixi `Container`, and `Container.label` is Pixi's debug name (a string). A
  subclass field `label` holding a `Label` clashes with it; call it `caption` or `title`.
- **Layout is explicit.** A `Stack` lays out when children are added or removed through it; after a child changes
  size (a translation, a new number), call `stack.layout()` and then `ui.layout()` for the pins. A `Button` re-centres
  a `Label` given new text by itself (`Widget.childResized`).
- **Presses on widgets never reach the world.** `UiPointerGate` marks the native event a widget took, and `Pointer`
  ignores that press. A game's own `Pointer.ignorePress` keeps working; the gate asks it too. A drag that started in a
  `ScrollView` is not a tap on the button under the finger.
- A pinned piece that grows (a clock pinned to the right edge) must be placed again, or it runs off the screen: compare
  `boxWidth` before and after and call `ui.layout()` when it changed.

## Layout maths

Pure functions, the same for canvas widgets and a DOM UI:

```ts
import { anchorPosition, fitToViewport, placeTooltip, stackLayout, wrapRow, listWidth } from '1681-engine/ui';

stackLayout([{ width: 80, height: 20 }, { width: 120, height: 20 }], { gap: 4, align: 'center' });
// → { width: 120, height: 44, items: [{ x: 20, y: 0, … }, { x: 0, y: 24, … }] }

anchorPosition('bottom-right', { width: 100, height: 40 }, { width: 800, height: 600 }, 8); // { x: 692, y: 552 }

const fit = fitToViewport({ width: 420, height: 600 }, { width: 360, height: 640 }, { margin: 8, scale: 2, minScale: 1, centre: true });
// where to stand, the scale to draw at, and whether the body must scroll (fit.scrollY)

placeTooltip(buttonRect, { width: 160, height: 48 }, viewport, { side: 'below' }); // flips above when there is no room
wrapRow(tabWidths, 300, 2); // tabs broken into rows no wider than 300
listWidth(labels, (l) => ctx.measureText(l).width, { padding: 16 }); // a drop-down as wide as its longest label
```

`fitToViewport` never lets a window overflow the screen: shrunk down to `minScale` if allowed, then cut to what is left
(the caller scrolls its body), then moved back inside the edges. A pixel-art game keeps `minScale` at its whole scale,
since a fractional one smears every texel. Also here: scrolling (`clampScroll`, `scrollIntoView`, `stepFling`), the
slider's maths (`quantize`, `sliderValueAt`), the bar's drain (`stepDrain`) and focus navigation (`nextFocus`).

## A DOM UI over the canvas

`DomOverlay` is the element a DOM or React UI is mounted in, laid exactly over the canvas and resized with it. It sits
beside the canvas in the same parent, so it needs no change to the page's CSS.

```ts
import { DomOverlay, DomWorldAnchors, InputShield, createStore } from '1681-engine/ui';

const overlay = new DomOverlay(engine.app.canvas, { className: 'game-ui' });
overlay.setScale(2); // a pixel-art UI laid out on half-size units and drawn back at ×2; also the CSS var --ui-scale
const shield = new InputShield(overlay.root); // typing in a field never reaches the game's keys

const panel = DomOverlay.interactive(document.createElement('div')); // the root lets presses through; this takes them
overlay.content.appendChild(panel);

// names over heads, placed every frame through the world layer's own transform
const anchors = new DomWorldAnchors(overlay, engine.stage.world);
anchors.attach(engine.app.ticker);
const nameTag = document.createElement('div');
nameTag.textContent = 'Ash';
const removeTag = anchors.add(nameTag, hero, { offsetY: -20 }); // centred above the point by default
```

- The overlay's root has `pointer-events: none`, so the world stays playable between panels. Give what the player
  presses `pointer-events: auto` (`DomOverlay.interactive`).
- `DomWorldAnchors` runs after Pixi renders, so it reads the camera as this frame drew it, shake included. It writes a
  style only when the rounded position or visibility changed, so a still crowd costs no DOM writes, and hides elements
  off screen (`margin` 64 px past the edge).
- `InputShield` stops presses, wheel and context menus on the UI, and every key typed into a field, from reaching
  window listeners (`Keyboard`, the game's own). A focused button keeps only Enter and Space; other keys still reach the
  game, so a button left focused after a click does not stop the hero walking. Releases always pass, or a key held when
  a field took focus would stick. `shield.typing` says whether the player is typing now.
- When CSS stretches a small fixed canvas, pass `logicalSize: () => engine.app.screen` so world placement follows it.

## A store between the game and its UI

`createStore` is a tiny shared state store, the same shape as zustand's vanilla stores. The game writes, the UI reads.

```ts
import { createStore } from '1681-engine/ui';

export const hud = createStore({ hp: 100, maxHp: 100, coins: 0 });

// in the game, every frame if you like: a patch that changes nothing notifies nobody
hud.setState({ hp: hero.hp });
hud.setState((s) => ({ coins: s.coins + 1 }));

// anywhere
const stop = hud.select((s) => s.hp, (hp, before) => flashIfLower(hp, before));
```

React reads it with `useStore(hud, (s) => s.hp)` from the [React kit](react.md#state-from-the-game), or with
`useSyncExternalStore(hud.subscribe, hud.getState)`.

## API

[`UiRoot`](/api/ui/classes/UiRoot) · [`FocusManager`](/api/ui/classes/FocusManager) · [`Widget`](/api/ui/classes/Widget) ·
[`Panel`](/api/ui/classes/Panel) · [`Button`](/api/ui/classes/Button) · [`Label`](/api/ui/classes/Label) ·
[`Bar`](/api/ui/classes/Bar) · [`Slider`](/api/ui/classes/Slider) · [`Toggle`](/api/ui/classes/Toggle) ·
[`Stack`](/api/ui/classes/Stack) · [`ScrollView`](/api/ui/classes/ScrollView) · [`List`](/api/ui/classes/List) ·
[`Dialog`](/api/ui/classes/Dialog) · [`fitToViewport`](/api/ui/functions/fitToViewport) ·
[`placeTooltip`](/api/ui/functions/placeTooltip) · [`DomOverlay`](/api/ui/classes/DomOverlay) ·
[`DomWorldAnchors`](/api/ui/classes/DomWorldAnchors) · [`InputShield`](/api/ui/classes/InputShield) ·
[`createStore`](/api/ui/functions/createStore)
