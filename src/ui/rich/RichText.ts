import { Sprite, type Container, type DestroyOptions } from 'pixi.js';
import type { TextureRegistry } from '../../core/TextureRegistry';
import { Widget } from '../Widget';
import type { RichFont } from './richFonts';
import { layoutRichText, type RichAlign, type RichLayout, type RichLayoutOptions, type RichMeasure } from './richLayout';
import { parseRichText, type RichMarkupOptions, type RichStyle } from './richMarkup';

export interface RichTextOptions extends RichLayoutOptions, RichMarkupOptions {
  /** What the runs are drawn with: `CanvasRichFont`, `BitmapRichFont`, or a game's own. */
  font: RichFont;
  /** Where `[icon=…]` keys are looked up; without it icons take no room and draw nothing. */
  textures?: TextureRegistry;
}

/**
 * Text with inline markup — colour, bold, italic, size and icons (see `parseRichText`) — wrapped to a width and
 * aligned. A `Widget`, so it stacks and pins like a `Label`, and a plain Pixi container in the world too.
 *
 * It does its work only when the text or the layout options change: no per-frame cost. Its runs and icons are kept
 * and reused when the text changes, so a log line rewritten keeps its display objects. Under a pixel-perfect UI root
 * (or with `pixelPerfect`) every run and icon lands on a whole pixel and icons scale by whole multiples.
 */
export class RichText extends Widget {
  private source = '';
  private last: RichLayout = { width: 0, height: 0, lines: [] };
  private readonly runs: Container[] = [];
  private readonly icons: Sprite[] = [];
  private readonly measure: RichMeasure;
  private readonly options: RichTextOptions;
  /** Whether the last layout was on whole pixels. */
  private snapped = false;

  constructor(markup: string, options: RichTextOptions) {
    super();
    this.options = { ...options };
    const font = options.font;
    this.measure = {
      textWidth: (t, s) => font.textWidth(t, s),
      lineHeight: (s) => font.lineHeight(s),
      ascent: (s: RichStyle) => font.ascent?.(s) ?? font.lineHeight(s) * 0.8,
      iconSize: (key, frame) => {
        const tex = options.textures?.get(key, frame);
        return tex ? { width: tex.orig.width, height: tex.orig.height } : { width: 0, height: 0 };
      },
    };
    this.source = markup;
    this.relayout();
    // built before it was added: a pixel-perfect root it lands under is only known now
    if (options.pixelPerfect === undefined) this.on('added', () => this.pixelPerfect() !== this.snapped && this.relayout());
  }

  /** The markup shown. */
  get markup(): string {
    return this.source;
  }

  /** Where every line, run and icon was placed, for hit-testing a word or drawing behind one. */
  get layout(): RichLayout {
    return this.last;
  }

  /** Changes the text; the same markup again costs nothing. */
  setText(markup: string): this {
    if (markup === this.source) return this;
    this.source = markup;
    this.relayout();
    return this;
  }

  /** Wraps to a new width (undefined: only at `\n`). */
  setWrapWidth(width: number | undefined): this {
    if (width === this.options.wrapWidth) return this;
    if (width === undefined) delete this.options.wrapWidth;
    else this.options.wrapWidth = width;
    this.relayout();
    return this;
  }

  setAlign(align: RichAlign): this {
    if (align === (this.options.align ?? 'left')) return this;
    this.options.align = align;
    this.relayout();
    return this;
  }

  /** Lays out and draws again: after the font's colours or the icons' textures were swapped under it. */
  relayout(): void {
    const pixelPerfect = (this.snapped = this.pixelPerfect());
    const spans = parseRichText(this.source, this.options);
    this.last = layoutRichText(spans, this.measure, { ...this.options, pixelPerfect });
    let r = 0;
    let n = 0;
    for (const line of this.last.lines) {
      for (const it of line.items) {
        if (it.kind === 'text') {
          const run = this.runs[r] ?? this.addRun();
          r++;
          this.options.font.updateRun(run, it.text, it.style);
          run.position.set(it.x, it.y);
          run.visible = true;
          continue;
        }
        if (!this.options.textures || it.width === 0) continue;
        const icon = this.icons[n] ?? this.addIcon();
        n++;
        icon.texture = this.options.textures.get(it.key, it.frame);
        icon.position.set(it.x, it.y);
        icon.setSize(it.width, it.height);
        icon.visible = true;
      }
    }
    // spares stay for the next text, hidden: a chat line that grows and shrinks makes nothing new
    for (; r < this.runs.length; r++) this.runs[r]!.visible = false;
    for (; n < this.icons.length; n++) this.icons[n]!.visible = false;

    const w = this.boxW;
    const h = this.boxH;
    this.boxW = Math.ceil(this.last.width);
    this.boxH = Math.ceil(this.last.height);
    if (this.boxW !== w || this.boxH !== h) this.notifyResized();
  }

  override destroy(options?: DestroyOptions): void {
    // the runs' canvases are this text's own; the icons' textures belong to the registry and are left alone
    super.destroy(typeof options === 'object' ? { ...options, children: true, texture: false } : { children: true });
  }

  protected redraw(): void {
    this.alpha = this.enabled ? 1 : 0.5;
  }

  private pixelPerfect(): boolean {
    return this.options.pixelPerfect ?? this.host?.pixelPerfect ?? false;
  }

  private addRun(): Container {
    const run = this.options.font.createRun();
    this.runs.push(run);
    this.addChild(run);
    return run;
  }

  private addIcon(): Sprite {
    const icon = new Sprite();
    icon.roundPixels = true;
    this.icons.push(icon);
    this.addChild(icon);
    return icon;
  }
}
