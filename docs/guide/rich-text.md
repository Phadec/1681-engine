# Rich text

`RichText` (in `1681-engine/ui`) prints text with inline markup — a word in gold, a bold name, a bigger number, a coin
icon in the middle of a sentence — wrapped to a width and aligned. Quest logs, item cards, chat lines, tutorial
prompts and shop prices are where it earns its keep.

It is a `Widget`, so it stacks, pins and sits in a `Dialog` like a `Label`; it is also a plain Pixi container, so it can
stand in the world. The markup parser and the line breaking are pure functions (`parseRichText`, `layoutRichText`),
tested under node and usable on their own.

## Markup

| Markup | Means |
|---|---|
| `[color=#f0c060]…[/color]` | colour: `#rgb`, `#rrggbb`, or a name you define (`colors: { gold: '#f0c060' }`) |
| `[b]…[/b]`, `[i]…[/i]` | bold, italic (canvas fonts; a bitmap font ignores them) |
| `[size=16]…[/size]` | font size in pixels |
| `[icon=coin]`, `[icon=items:12]` | an inline icon: a texture key from the `TextureRegistry`, and after the last `:` a frame of it |
| `[[` | a literal `[` |
| a new line | a line break |

Tags nest. Tags still open at the end close there, and closing an outer tag closes what was opened inside it. Anything
else in brackets — an unknown tag, a bad value, a close with nothing open — is printed as written, so a typo shows on
screen instead of eating the rest of the text.

## A price line

```ts
import { CanvasRichFont, RichText } from '1681-engine/ui';

await document.fonts.load('12px "My UI Font"'); // measure and draw in the real font, not the fallback

const font = new CanvasRichFont({ fontFamily: 'My UI Font', fontSize: 12, color: '#efe6ff' });
const price = new RichText('Buy [b]Iron Sword[/b] for [color=gold]250[/color] [icon=ui_icons:coin]', {
  font,
  textures: stage.textures, // where icon keys are looked up
  colors: { gold: '#f0c060' },
  wrapWidth: 180,
  align: 'center',
  lineSpacing: 2,
});
ui.pin(price, 'bottom', 12);

price.setText('Sold out'); // the same text again costs nothing; a new one reuses the runs and icons
```

An icon is scaled to the height of its line — on a pixel-perfect layout to the largest **whole** multiple of its frame
that fits (never below 1×), so its texels stay square. `iconScale: 2` fixes the scale instead. An icon and the word it
touches (`[icon=coin]250`) never break apart.

`setWrapWidth(w)` and `setAlign(a)` lay it out again; `layout` holds where every line, run and icon went (to hit-test a
word, or draw a highlight behind one); `relayout()` redoes it after you swapped the textures it shows.

## Canvas or bitmap font

| Font | Draws runs with | Bold, italic | Changing the text |
|---|---|---|---|
| `CanvasRichFont` | Pixi `Text` | yes | repaints and uploads each changed run's canvas |
| `BitmapRichFont` | Pixi `BitmapText` from `installLabelFont` | no | costs no canvas and no upload |

Text that changes every frame — a timer, a counter with an icon — belongs in a `BitmapRichFont`. Each colour × size of
a bitmap font is a font of its own, baked the first time a line uses it, so keep to a few and print each once while
loading (or call `installLabelFont` with the same arguments ahead). Letters beyond ASCII go in `glyphs`, as for every
label font.

A game can bring its own font by implementing `RichFont`: measure (`textWidth`, `lineHeight`, optional `ascent`), and
make and update one display object a run (`createRun`, `updateRun`).

## Player text

Never put what players typed into markup as it is: a name like `[size=200]` would print at 200 px. Escape it.

```ts
import { escapeRichText } from '1681-engine/ui';

chat.setText(`[color=#8fd]${escapeRichText(player.name)}[/color]: ${escapeRichText(message)}`);
```

`stripRichText(markup)` gives the plain text back, tags and icons gone — for logs, search and screen readers.

## The layout on its own

`layoutRichText(spans, measure, options)` is the line breaker `RichText` uses, with the measuring handed in. It breaks
at spaces and new lines, breaks a word wider than the whole line between letters, drops spaces a wrap leaves at a line's
start or end, puts runs of different sizes on one baseline, and merges neighbouring text of one style into one item —
a paragraph in one colour is one display object a line.

```ts
import { layoutRichText, parseRichText, type RichMeasure } from '1681-engine/ui';

const mono: RichMeasure = {
  textWidth: (text, style) => text.length * 0.6 * (style.size ?? 10),
  lineHeight: (style) => 1.2 * (style.size ?? 10),
  iconSize: () => ({ width: 8, height: 8 }),
};
const layout = layoutRichText(parseRichText('the quick [b]brown[/b] fox'), mono, { wrapWidth: 60 });
// layout.lines[0].items → [{ kind: 'text', text: 'the quick', x: 0, … }], layout.lines[1] → 'brown', ' fox'
```

That is also how a DOM UI or a server can know where a line will wrap without drawing it.

## Pitfalls

- **Load the font first.** A canvas font measured before `document.fonts.load` measures the fallback; the lines wrap
  in the wrong places and do not change when the real font arrives. Call `relayout()` if you must show it earlier.
- **Pixel-perfect is read when it is laid out.** A `RichText` built before it is added to a pixel-perfect `UiRoot` lays
  itself out again when it is added; one moved between roots later should be given `pixelPerfect` explicitly.
- **Bitmap fonts bake mid-frame** the first time a colour or size is used. Keep the palette small and warm it up.
- **A stroke widens every run.** Canvas text measures its stroke into each run's width, so runs of different styles
  side by side sit a stroke apart. Prefer no stroke for body text, or a bitmap font.
- **No per-frame cost, but no animation either.** It does its work only in `setText`, `setWrapWidth`, `setAlign` and
  `relayout`; tween its alpha or position like any container, not its text every frame on a canvas font.
