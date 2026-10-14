# React kit

`1681-engine/react` is the kit a game's DOM UI is built from when it is written in React: windows, tabs, a
list-and-detail pane, a drop-down, tooltips, dialogs, a slider and pixel images. It is laid out by the engine's own
[layout maths](ui.md#layout-maths), so a window never overflows the screen and lands on whole pixels, and themed by
CSS custom properties, so the same components wear a pixel-art frame or a flat modern one.

React and React DOM 19 are optional peer dependencies: only a game that imports `1681-engine/react` needs them. The
core and `1681-engine/ui` never import React.

```sh
npm install react react-dom
```

## Mounting

```tsx
import { createRoot } from 'react-dom/client';
import { DomOverlay, InputShield } from '1681-engine/ui';
import { ChoiceDialog, ConfirmDialog, TitleTips, UiProvider, injectBaseCss } from '1681-engine/react';

injectBaseCss(); // the base stylesheet, first in <head>, so the game's own CSS wins

const overlay = new DomOverlay(engine.app.canvas);
new InputShield(overlay.root); // typing in a field never reaches the game's keys

createRoot(overlay.content).render(
  <UiProvider
    viewport={() => ({ width: overlay.width / overlay.scale, height: overlay.height / overlay.scale })}
    portal={() => overlay.content}
  >
    <GameUi />
    <ConfirmDialog />
    <ChoiceDialog />
    <TitleTips />
  </UiProvider>,
);
```

`UiProvider` is optional. Without it, components place themselves in the browser window and portal tooltips, lists and
dialogs to `document.body`. Inside a `DomOverlay`, hand it the overlay's content size and the content itself, so they
land inside the overlay's scaled box. Its other settings:

| Prop | Default | What |
|---|---|---|
| `touch` | `isTouchUi()` | fingers: windows become full-screen sheets, tooltips are off |
| `scale` | 1 | the scale windows are drawn at; a whole multiple for a pixel-art UI |
| `minScale` | `scale` | how far a window may shrink before its body scrolls instead |
| `sheetScale` | 1 | a player's "window size" for touch sheets |
| `margin` | 8 | kept clear between a window and the screen's edges |
| `snap` | true | positions on whole pixels: pixel art at x.5 reads blurred |
| `labels` | English | the kit's own words, below |

The overlay's root lets presses through to the canvas. Each component stops its own presses from reaching the world (a
`Panel` stops `pointerdown`), and a `Modal`'s backdrop takes every press behind it.

## A game's own class names

A game that already has a stylesheet for its own controls need not rewrite it to take the kit: `classNames` hangs its
names beside the kit's on every element, keyed by the kit's name without the `e1681-` prefix, states included.

```tsx
<UiProvider classNames={{ tabs: 'tabs', tab: 'tab', button: 'btn', split: 'split-pane', select: 'pixel-select', picked: 'active' }}>
```

A tab then renders `class="e1681-tab tab active"`, and the game's `.tabs .tab.active` rules style it as before. Leave
`injectBaseCss()` out when the game's stylesheet covers everything, and add only the few structural rules its own
markup never needed (a dialog's `position: fixed`, the select list hidden while it is `measuring`). `useCx()` gives a
game's own components the same joiner.

## Theming

Everything is themed by custom properties set on `:root` (or any ancestor). Frames are 9-slice `border-image`s the
game draws: `url(…)`, the slice (`fill` to show the middle), and the border widths.

```css
:root {
  --e1681-font: 'My Pixel Font';
  --e1681-font-size: 16px;
  --e1681-text: #ece6d6;
  --e1681-muted: #9c968a;
  --e1681-accent: #f0c060;
  --e1681-bg: #1d242e;
  --e1681-frame: url(/ui/frame.svg);
  --e1681-frame-slice: 16 20 20 16 fill;
  --e1681-frame-width: 16px 20px 20px 16px;
  --e1681-control-frame: url(/ui/button.svg);
  --e1681-control-frame-slice: 6 fill;
  --e1681-control-frame-width: 6px;
}
```

| Property | What |
|---|---|
| `--e1681-font`, `--e1681-font-size` | the UI's font |
| `--e1681-text`, `--e1681-muted`, `--e1681-accent` | text, quiet text, the picked or lit colour |
| `--e1681-bg`, `--e1681-well`, `--e1681-control-bg` | a window's fill, a sunk pane's, a button's or field's |
| `--e1681-border`, `--e1681-border-width` | the plain border used while no frame image is given |
| `--e1681-frame`, `-slice`, `-width` | windows and dialogs |
| `--e1681-tip-frame`, `-slice`, `-width` | tooltips and the select's list (default: the window frame) |
| `--e1681-control-frame`, `-slice`, `-width` | buttons, the select, text fields |
| `--e1681-tab-frame`, `--e1681-tab-active-frame`, `-slice`, `-width` | tabs |
| `--e1681-well-frame`, `-slice`, `-width` | the split pane's detail, the slider's track |
| `--e1681-backdrop` | behind a dialog |
| `--e1681-split-list` | the split pane's list column (set by its `listWidth` prop) |

A `-width` takes one to four lengths, like `border-width`. The classes (`e1681-button`, `e1681-input`, `e1681-row`,
`e1681-pickable`, …) are there for your own buttons and rows to match. `baseCss` is the stylesheet as a string, for a
game that copies it into its own CSS instead of injecting it.

The stylesheet keeps the pixel rules: no `translate(-50%)` centring and no `zoom` (the components place in whole
pixels), no blurred shadow and no gradient.

## Labels

Every word on screen is the game's: a prop, or a `labels` entry with an English default (`DEFAULT_LABELS`). The engine
never translates anything.

```tsx
<UiProvider labels={{ close: 'Fermer {0}', closeHint: 'Fermer (Échap)', cancel: 'Annuler', ok: 'OK', choose: 'Choisir', backToList: '‹ Liste', pickHint: 'Choisissez à gauche.', quantity: 'Quantité' }}>
```

With a [`Translator`](i18n.md), build the labels from `tr` and pass a new object when the language changes.

## Components

### `Panel`

```tsx
<Panel title="Inventory" onClose={close} width={420} footer={<button className="e1681-button">Sort</button>}>
  {items.map((it) => <ItemRow key={it.id} item={it} />)}
</Panel>
```

A window fitted into the screen by `fitToViewport`: moved inside the edges, cut to what is left, shrunk to `minScale`
if allowed, its header kept and its body scrolling. `at` asks for a position (screen px); by default it is centred.
On a touch screen it is a full-screen sheet instead. No close button without `onClose`; `titleText` names it for a
screen reader when `title` is not a string.

### `TabStrip`

```tsx
<TabStrip tabs={[{ id: 'gear', label: 'Gear' }, { id: 'items', label: 'Items' }, { id: 'quest', label: 'Quest', disabled: true, title: 'Nothing yet' }]} value={tab} onChange={setTab} />
```

Every row of tabs (a window's sections, a filter, a difficulty) goes through here, so they all read the same. `wrap`
breaks a long strip onto more rows instead of scrolling it; `small` is the short strip over a field. A mouse takes a
tab the moment it is pressed; a finger only on a tap, since a finger also presses to scroll the strip.

### `SplitPane` and `usePicked`

```tsx
const [picked, pick] = usePicked(letters, (l) => l.id, false); // false: never opened without the player choosing

<SplitPane
  listWidth="40%"
  list={letters.map((l) => (
    <div key={l.id} className={`e1681-row e1681-pickable${picked === l ? ' picked' : ''}`} onClick={() => pick(l.id)}>{l.subject}</div>
  ))}
  detail={picked && <Letter letter={picked} />}
/>
```

A list that scrolls on its own beside the detail of what is picked, which stays in view however long the list grows.
On a touch screen narrower than `stackBelow` (600) only one pane shows: tapping a `.e1681-pickable` row opens its
detail and a back button returns. `usePicked` keeps the pick by key; while nothing is picked, or the picked entry is
gone (sold, used up), the first stands in, unless `auto` is false. In a touch sheet, `useFillSheet` sizes the pane to
what is left below whatever sits above it.

### `Select`

```tsx
<Select value={quality} options={[{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }]} onChange={setQuality} label="Quality" />
```

A drop-down drawn by the theme instead of the browser's `<select>`, whose list is the OS's own widget and whose box
clips its text. The button is as wide as its longest label; the list opens in a portal (no window's `overflow` cuts
it), as wide as its longest label, under the button or over it where the screen ends. A press never takes the focus,
so a text field beside it keeps its keyboard. `grow` fills its row and cuts the label with an ellipsis.

### `Tooltip` and `TitleTips`

```tsx
{hover && <Tooltip x={hover.x} y={hover.y}>{item.description}</Tooltip>}
{rect && <Tooltip anchor={rect} side="right">{skill.text}</Tooltip>}
```

A tooltip kept on screen by its own measured size: under the cursor while it fits, over it when it does not, slid
along the edge, never taller than the viewport. `TitleTips`, mounted once, draws every plain `title=` as the kit's
tooltip instead of the browser's, so components keep writing `title=`. Both are desktop only: a touch screen never
showed a title.

### `ConfirmDialog`, `askConfirm`, `askQuantity`

```tsx
if (await askConfirm('Drop the sword?', { ok: 'Drop' })) drop();
const n = await askQuantity('Sell how many?', stack.count); // 0 when cancelled
```

A question in the kit's own dialog instead of `window.confirm`, from anywhere (not only components), answered by the
one `<ConfirmDialog />` mounted at the UI's root. Enter confirms, Esc or a press outside cancels. A quantity is asked
with a slider, − and + and a field for an exact number, since a slider over 99 cannot land on 37 with a thumb. A new
question cancels the one still open; `cancelConfirm()` answers a phone's back button.

### `ChoiceDialog` and `askChoice`

```tsx
const id = await askChoice('Which path?', [
  { id: 'north', label: 'The north road', note: 'Lv 10' },
  { id: 'river', label: 'The river', disabled: true },
]); // null when cancelled
```

A row per option, the first that can be taken picked; Enter takes it, a double-click takes a row at once.

### `Modal`

```tsx
<Modal onCancel={close} onConfirm={save} width={360} actions={<button className="e1681-button" onClick={save}>Save</button>}>
  …
</Modal>
```

A dialog box over a backdrop, fitted and portalled like the others. Esc and Enter are caught on the window in the
capture phase, so they do not also close the window under it or reach the game's keys.

### `Slider`

```tsx
<Slider label="Music" value={volume} onChange={setVolume} step={0.05} />
```

Arrows, Page Up/Down and Home/End step it; `format` says how the value reads (a percentage by default), `hideValue`
hides the number beside the track.

### `PixelImage`

```tsx
<PixelImage src={portraitUrl} width={64} height={64} />
```

A sprite whose size is not known ahead (a creature, a portrait), shown at the largest **whole** multiple of its art
that fits the box, never a fractional one. Hidden until it has loaded and been measured, so it never flashes at the
wrong size. `upscaled` says how many image pixels the file already spends on one art pixel.

### `Glyph`

```tsx
<button className="e1681-button"><Glyph id="close" /> Close</button>
registerGlyph('coin', { rows: ['.YYY.', 'YyyyY', 'YyyyY', '.YYY.'], tones: { Y: '#f0c040', y: '#c08020' } });
```

Small marks (close, check, arrows, a star, a lock…) as pixel art in the text's colour. A pixel font usually carries
letters only, so a ✕ or → typed into the UI falls back to a smooth system font in the middle of pixel text. `scale` is
screen pixels per glyph pixel, a whole number. In the rows, `.` is empty, `X` the text's colour, any other letter a
colour from `tones`.

## State from the game

```tsx
import { createStore } from '1681-engine/ui';
import { useStore } from '1681-engine/react';

export const hud = createStore({ hp: 100, maxHp: 100 });

function HealthText() {
  const hp = useStore(hud, (s) => s.hp); // renders again only when hp changes
  return <span>{hp}</span>;
}
```

The game writes the store as often as it likes; a patch that changes nothing notifies nobody. A `select` must return
something stable (a field, a number), not a new object each call, or React renders forever.

## Pure placement helpers

The decisions the components make are exported and tested under node, for a component of your own: `windowStyle`
(`fitToViewport` as a style), `cursorTip`, `listPlacement`, `pixelFit`, `splitModeFor`, `sheetScaleStyle`.

## API

[`UiProvider`](/api/react/functions/UiProvider) · [`UiSettings`](/api/react/interfaces/UiSettings) ·
[`UiLabels`](/api/react/interfaces/UiLabels) · [`baseCss`](/api/react/variables/baseCss) ·
[`Panel`](/api/react/functions/Panel) · [`TabStrip`](/api/react/functions/TabStrip) ·
[`SplitPane`](/api/react/functions/SplitPane) · [`Select`](/api/react/functions/Select) ·
[`Tooltip`](/api/react/functions/Tooltip) · [`TitleTips`](/api/react/functions/TitleTips) ·
[`askConfirm`](/api/react/functions/askConfirm) · [`askChoice`](/api/react/functions/askChoice) ·
[`Modal`](/api/react/functions/Modal) · [`Slider`](/api/react/functions/Slider) ·
[`PixelImage`](/api/react/functions/PixelImage) · [`Glyph`](/api/react/variables/Glyph) ·
[`useStore`](/api/react/functions/useStore)
