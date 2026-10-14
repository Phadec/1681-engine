/**
 * The markup `RichText` reads: square-bracket tags, like BBCode, chosen because a translator can type them, a chat
 * line can carry them, and nothing in ordinary prose looks like one.
 *
 * | Markup | Means |
 * |---|---|
 * | `[color=#f0c060]…[/color]` | colour: `#rgb`, `#rrggbb`, or a name the caller defines (`colors: { gold: '#f0c060' }`) |
 * | `[b]…[/b]`, `[i]…[/i]` | bold, italic (where the font has them) |
 * | `[size=16]…[/size]` | font size in pixels |
 * | `[icon=coin]`, `[icon=items:12]` | an inline icon: a texture key, and after the last `:` a frame of it |
 * | `[[` | a literal `[` |
 *
 * Anything else in brackets — an unknown tag, a bad value, a close with nothing open — is printed as written, so a
 * typo shows on screen instead of swallowing the text after it. Tags still open at the end are closed there; closing
 * an outer tag closes the ones opened inside it. Text from players (names, chat) goes through `escapeRichText` first.
 * Pure: no Pixi, no DOM.
 */

/** How a run of text is drawn. Unset fields fall back to the font's own. */
export interface RichStyle {
  color?: string;
  bold: boolean;
  italic: boolean;
  size?: number;
}

export interface RichTextSpan {
  kind: 'text';
  text: string;
  style: RichStyle;
}

export interface RichIconSpan {
  kind: 'icon';
  key: string;
  frame?: string;
  /** The style around it: its size decides the icon's height. */
  style: RichStyle;
}

export type RichSpan = RichTextSpan | RichIconSpan;

export interface RichMarkupOptions {
  /** Colour names the markup may use besides hex (`[color=gold]`). */
  colors?: Readonly<Record<string, string>>;
}

const PLAIN: RichStyle = Object.freeze({ bold: false, italic: false }) as RichStyle;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const SIZE = /^\d+(?:\.\d+)?$/;

/** Makes text safe to put inside markup: every `[` doubled, so a player named `[b]` prints as typed. */
export function escapeRichText(text: string): string {
  return text.replace(/\[/g, '[[');
}

/** Parses markup into spans; adjacent text of one style is one span. */
export function parseRichText(source: string, options: RichMarkupOptions = {}): RichSpan[] {
  const spans: RichSpan[] = [];
  const open: { name: string; style: RichStyle }[] = [];
  const style = (): RichStyle => open[open.length - 1]?.style ?? PLAIN;
  const text = (s: string): void => {
    if (!s) return;
    const st = style();
    const last = spans[spans.length - 1];
    if (last && last.kind === 'text' && last.style === st) last.text += s;
    else spans.push({ kind: 'text', text: s, style: st });
  };

  let i = 0;
  let plainFrom = 0;
  while (i < source.length) {
    if (source[i] !== '[') {
      i++;
      continue;
    }
    text(source.slice(plainFrom, i));
    if (source[i + 1] === '[') {
      text('[');
      i += 2;
      plainFrom = i;
      continue;
    }
    const end = source.indexOf(']', i + 1);
    const inner = end < 0 ? null : source.slice(i + 1, end);
    // a `[` inside the tag means this one was never closed: print it and look again from the next bracket
    if (inner === null || inner.includes('[') || !applyTag(inner, open, style(), spans, options)) {
      text('[');
      i += 1;
      plainFrom = i;
      continue;
    }
    i = end + 1;
    plainFrom = i;
  }
  text(source.slice(plainFrom));
  return spans;
}

/** Plain text of markup: tags gone, icons gone, escapes undone (for measuring, logs, screen readers). */
export function stripRichText(source: string, options: RichMarkupOptions = {}): string {
  let out = '';
  for (const s of parseRichText(source, options)) if (s.kind === 'text') out += s.text;
  return out;
}

/** Applies one tag's effect; false when it is not a tag (printed as written then). */
function applyTag(inner: string, open: { name: string; style: RichStyle }[], current: RichStyle, spans: RichSpan[], options: RichMarkupOptions): boolean {
  if (inner.startsWith('/')) {
    const name = inner.slice(1).trim().toLowerCase();
    for (let k = open.length - 1; k >= 0; k--) {
      if (open[k]!.name !== name) continue;
      open.length = k;
      return true;
    }
    return false;
  }
  const eq = inner.indexOf('=');
  const name = (eq < 0 ? inner : inner.slice(0, eq)).trim().toLowerCase();
  const value = eq < 0 ? null : inner.slice(eq + 1).trim();
  switch (name) {
    case 'b':
    case 'i':
      if (value !== null) return false;
      open.push({ name, style: { ...current, [name === 'b' ? 'bold' : 'italic']: true } });
      return true;
    case 'color': {
      const colour = value === null ? undefined : HEX.test(value) ? value : options.colors?.[value];
      if (!colour) return false;
      open.push({ name, style: { ...current, color: colour } });
      return true;
    }
    case 'size': {
      if (value === null || !SIZE.test(value) || Number(value) <= 0) return false;
      open.push({ name, style: { ...current, size: Number(value) } });
      return true;
    }
    case 'icon': {
      if (!value) return false;
      const colon = value.lastIndexOf(':');
      const icon: RichIconSpan = colon > 0 ? { kind: 'icon', key: value.slice(0, colon), frame: value.slice(colon + 1), style: current } : { kind: 'icon', key: value, style: current };
      spans.push(icon);
      return true;
    }
    default:
      return false;
  }
}
