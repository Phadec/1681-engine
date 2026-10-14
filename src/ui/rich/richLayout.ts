import type { RichSpan, RichStyle } from './richMarkup';

/**
 * Line breaking and placement for `RichText`, pure: every width and height comes from a `RichMeasure` the caller
 * hands in, so the same layout runs under node in a test, with a canvas font, or with a bitmap font.
 *
 * Lines break only at spaces and `\n`; a word wider than the whole line is broken between letters. Text and icons
 * with no space between them (`[icon=coin]50`) stay together. Text of one style that ends up side by side on a line
 * is one item, so a paragraph in one colour costs one display object a line.
 */

export interface RichMeasure {
  /** Advance width of `text` in `style` (spaces included: they are measured on their own). */
  textWidth(text: string, style: RichStyle): number;
  /** Height of a line of text in `style`. */
  lineHeight(style: RichStyle): number;
  /** Baseline from the top of such a line; 0.8 of the line height when not given. */
  ascent?(style: RichStyle): number;
  /** Size of an icon's frame in texture pixels. */
  iconSize(key: string, frame: string | undefined): { width: number; height: number };
}

export type RichAlign = 'left' | 'center' | 'right';

export interface RichLayoutOptions {
  /** Wrap lines to this width; unset, lines break only at `\n`. */
  wrapWidth?: number;
  align?: RichAlign;
  /** Extra pixels between lines. */
  lineSpacing?: number;
  /**
   * `'line'` (default): an icon is as tall as its style's line — on a pixel-perfect layout the largest whole multiple
   * of its frame that fits, never below 1×, so its texels stay square. A number: that scale, whatever the line.
   */
  iconScale?: 'line' | number;
  /** Whole-pixel positions and icon scales (a pixel-art game). */
  pixelPerfect?: boolean;
}

export interface RichTextItem {
  kind: 'text';
  text: string;
  style: RichStyle;
  x: number;
  /** Top of the text's own line box. */
  y: number;
  width: number;
  height: number;
}

export interface RichIconItem {
  kind: 'icon';
  key: string;
  frame?: string;
  style: RichStyle;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RichItem = RichTextItem | RichIconItem;

export interface RichLine {
  y: number;
  width: number;
  height: number;
  /** Baseline from the line's top. */
  baseline: number;
  items: RichItem[];
}

export interface RichLayout {
  /** The box: `wrapWidth` when wrapping, else the widest line. */
  width: number;
  height: number;
  lines: RichLine[];
}

/** One unbreakable piece before placing: a word, a run of spaces, a line break, or an icon. */
type Atom =
  | { t: 'word'; text: string; style: RichStyle; w: number }
  | { t: 'space'; text: string; style: RichStyle; w: number }
  | { t: 'br'; style: RichStyle }
  | { t: 'icon'; key: string; frame?: string; style: RichStyle; w: number; h: number };

type Placed = Exclude<Atom, { t: 'br' }>;

const EPSILON = 1e-6;

/** Breaks spans into lines and places every run and icon. */
export function layoutRichText(spans: readonly RichSpan[], measure: RichMeasure, options: RichLayoutOptions = {}): RichLayout {
  const atoms = toAtoms(spans, measure, options);
  const wrap = options.wrapWidth;
  const rows: { atoms: Placed[]; empty: RichStyle }[] = [];
  let row: Placed[] = [];
  let rowW = 0;
  let pending: Placed[] = [];
  let wrapped = false;
  let emptyStyle: RichStyle = spans[0]?.style ?? { bold: false, italic: false };
  const finish = (): void => {
    rows.push({ atoms: row, empty: emptyStyle });
    row = [];
    rowW = 0;
    pending = [];
  };

  for (let k = 0; k < atoms.length; ) {
    const a = atoms[k]!;
    if (a.t === 'br') {
      emptyStyle = a.style;
      finish();
      wrapped = false;
      k++;
      continue;
    }
    if (a.t === 'space') {
      pending.push(a);
      k++;
      continue;
    }
    // a cluster: words and icons with nothing between them
    const cluster: Placed[] = [];
    while (k < atoms.length && (atoms[k]!.t === 'word' || atoms[k]!.t === 'icon')) cluster.push(atoms[k++] as Placed);
    const w = sum(cluster);
    if (row.length === 0 && wrapped) pending = []; // spaces a wrap left at the start of a line are dropped
    if (wrap !== undefined && row.length > 0 && rowW + sum(pending) + w > wrap + EPSILON) {
      finish();
      wrapped = true;
    }
    for (const p of pending) row.push(p);
    rowW += sum(pending);
    pending = [];
    if (wrap !== undefined && rowW + w > wrap + EPSILON) {
      // wider than the line on its own: break it between letters
      for (const piece of cluster) {
        for (const part of splitToFit(piece, measure, wrap, () => rowW)) {
          if (part === 'break') {
            finish();
            wrapped = true;
            continue;
          }
          row.push(part);
          rowW += part.w;
        }
      }
    } else {
      for (const p of cluster) row.push(p);
      rowW += w;
    }
  }
  if (row.length > 0 || rows.length === 0 || atoms[atoms.length - 1]?.t === 'br') finish();

  return place(rows, measure, options);
}

function toAtoms(spans: readonly RichSpan[], measure: RichMeasure, options: RichLayoutOptions): Atom[] {
  const atoms: Atom[] = [];
  for (const s of spans) {
    if (s.kind === 'icon') {
      const size = measure.iconSize(s.key, s.frame);
      const scale = iconScale(size.height, measure.lineHeight(s.style), options);
      const icon: Atom = { t: 'icon', key: s.key, style: s.style, w: size.width * scale, h: size.height * scale };
      if (s.frame !== undefined) icon.frame = s.frame;
      atoms.push(icon);
      continue;
    }
    for (const m of s.text.matchAll(/(\r?\n)|([ \t]+)|([^ \t\r\n]+)/g)) {
      if (m[1]) atoms.push({ t: 'br', style: s.style });
      else if (m[2]) atoms.push({ t: 'space', text: m[2], style: s.style, w: measure.textWidth(m[2], s.style) });
      else atoms.push({ t: 'word', text: m[3]!, style: s.style, w: measure.textWidth(m[3]!, s.style) });
    }
  }
  return atoms;
}

function iconScale(frameHeight: number, lineHeight: number, options: RichLayoutOptions): number {
  if (typeof options.iconScale === 'number') return options.iconScale;
  if (frameHeight <= 0) return 1;
  const fit = lineHeight / frameHeight;
  return options.pixelPerfect ? Math.max(1, Math.floor(fit)) : fit;
}

/** A piece too wide for the line cut into parts that fit, with 'break' between them. */
function* splitToFit(piece: Placed, measure: RichMeasure, wrap: number, rowWidth: () => number): Generator<Placed | 'break'> {
  if (piece.t !== 'word') {
    if (rowWidth() > 0 && rowWidth() + piece.w > wrap + EPSILON) yield 'break';
    yield piece;
    return;
  }
  const chars = Array.from(piece.text);
  let from = 0;
  while (from < chars.length) {
    // the longest prefix that fits; at least one letter on an empty line, or nothing would ever be placed
    let to = from;
    let w = 0;
    while (to < chars.length) {
      const next = measure.textWidth(chars.slice(from, to + 1).join(''), piece.style);
      if (rowWidth() + next > wrap + EPSILON && !(to === from && rowWidth() === 0)) break;
      w = next;
      to++;
    }
    if (to === from) {
      yield 'break';
      continue;
    }
    yield { t: 'word', text: chars.slice(from, to).join(''), style: piece.style, w };
    from = to;
    if (from < chars.length) yield 'break';
  }
}

function place(rows: { atoms: Placed[]; empty: RichStyle }[], measure: RichMeasure, options: RichLayoutOptions): RichLayout {
  const snap = options.pixelPerfect ? Math.round : (v: number) => v;
  const spacing = options.lineSpacing ?? 0;
  const ascentOf = (st: RichStyle, lh: number): number => measure.ascent?.(st) ?? lh * 0.8;
  const lines: RichLine[] = [];
  let y = 0;
  for (const r of rows) {
    while (r.atoms.length > 0 && r.atoms[r.atoms.length - 1]!.t === 'space') r.atoms.pop();
    const items = mergeRuns(r.atoms, measure);
    // the line box: every item placed against one baseline, then the box is whatever they cover
    let top = 0;
    let bottom = 0;
    const offsets: number[] = [];
    if (items.length === 0) {
      const lh = measure.lineHeight(r.empty);
      top = -ascentOf(r.empty, lh);
      bottom = top + lh;
    }
    items.forEach((it, n) => {
      const lh = measure.lineHeight(it.style);
      const asc = ascentOf(it.style, lh);
      const t = it.kind === 'text' ? -asc : -asc + (lh - it.height) / 2;
      offsets[n] = t;
      if (n === 0 || t < top) top = t;
      if (n === 0 || t + it.height > bottom) bottom = t + it.height;
    });
    const baseline = snap(-top);
    const height = options.pixelPerfect ? Math.ceil(bottom - top) : bottom - top;
    let x = 0;
    items.forEach((it, n) => {
      it.x = x;
      it.y = y + snap(baseline + offsets[n]!);
      x += it.width;
    });
    lines.push({ y, width: x, height, baseline, items });
    y += height + spacing;
  }
  const height = lines.length === 0 ? 0 : y - spacing;
  const widest = lines.reduce((m, l) => Math.max(m, l.width), 0);
  const width = options.wrapWidth ?? widest;
  const k = options.align === 'center' ? 0.5 : options.align === 'right' ? 1 : 0;
  for (const l of lines) {
    const dx = (width - l.width) * k;
    for (const it of l.items) it.x = snap(it.x + dx);
  }
  return { width: options.pixelPerfect ? Math.ceil(width) : width, height, lines };
}

/** Neighbouring words and spaces of one style become one text item, measured whole (kerning across the space). */
function mergeRuns(atoms: Placed[], measure: RichMeasure): RichItem[] {
  const items: RichItem[] = [];
  for (const a of atoms) {
    if (a.t === 'icon') {
      const icon: RichIconItem = { kind: 'icon', key: a.key, style: a.style, x: 0, y: 0, width: a.w, height: a.h };
      if (a.frame !== undefined) icon.frame = a.frame;
      items.push(icon);
      continue;
    }
    const last = items[items.length - 1];
    if (last && last.kind === 'text' && sameStyle(last.style, a.style)) last.text += a.text;
    else items.push({ kind: 'text', text: a.text, style: a.style, x: 0, y: 0, width: 0, height: measure.lineHeight(a.style) });
  }
  for (const it of items) if (it.kind === 'text') it.width = measure.textWidth(it.text, it.style);
  return items;
}

export function sameStyle(a: RichStyle, b: RichStyle): boolean {
  return a === b || (a.color === b.color && a.bold === b.bold && a.italic === b.italic && a.size === b.size);
}

function sum(atoms: readonly Placed[]): number {
  let w = 0;
  for (const a of atoms) w += a.w;
  return w;
}
