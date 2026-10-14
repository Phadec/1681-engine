import { BitmapFontManager, BitmapText, CanvasTextMetrics, Text, TextStyle, type Container } from 'pixi.js';
import { installLabelFont } from '../../core/BitmapLabel';
import type { RichMeasure } from './richLayout';
import type { RichStyle } from './richMarkup';

/**
 * What `RichText` draws its runs with: it measures text for the layout and makes and updates one display object a
 * run. Two come with the engine — `CanvasRichFont` (any font, bold and italic) and `BitmapRichFont` (glyphs baked
 * once, cheap to change) — and a game may write its own.
 */
export interface RichFont extends Omit<RichMeasure, 'iconSize'> {
  /** A fresh, empty run. */
  createRun(): Container;
  /** Shows `text` in `style` on a run made by `createRun`; cheap when neither changed. */
  updateRun(run: Container, text: string, style: RichStyle): void;
}

export interface RichFontOptions {
  /** Must already be loaded (`document.fonts.load`), or the text measures and bakes in the fallback. */
  fontFamily: string;
  /** The size of text with no `[size]`. */
  fontSize: number;
  /** The colour of text with no `[color]`. */
  color?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Texture pixels per pixel: text in the world is zoomed by the camera, so it is rasterised finer. */
  resolution?: number;
}

interface Metrics {
  lineHeight: number;
  ascent: number;
}

function styleKey(s: RichStyle): string {
  return `${s.color ?? ''}|${s.bold ? 1 : 0}|${s.italic ? 1 : 0}|${s.size ?? ''}`;
}

/**
 * Runs as canvas `Text`: any font the page has, with bold and italic. Every style used gets one Pixi `TextStyle`,
 * shared by every run in it. Changing a run's text repaints and uploads its canvas, so text rewritten every frame
 * belongs in a `BitmapRichFont`.
 */
export class CanvasRichFont implements RichFont {
  private readonly styles = new Map<string, TextStyle>();
  private readonly metrics = new Map<string, Metrics>();

  constructor(private readonly options: RichFontOptions) {}

  textWidth(text: string, style: RichStyle): number {
    // wordWrap off: the layout breaks lines, Pixi only measures
    return CanvasTextMetrics.measureText(text, this.pixiStyle(style), undefined, false).width;
  }

  lineHeight(style: RichStyle): number {
    return this.metricsOf(style).lineHeight;
  }

  ascent(style: RichStyle): number {
    return this.metricsOf(style).ascent;
  }

  createRun(): Container {
    return new Text({ text: '', style: this.pixiStyle({ bold: false, italic: false }), resolution: this.options.resolution ?? 1 });
  }

  updateRun(run: Container, text: string, style: RichStyle): void {
    const t = run as Text;
    const st = this.pixiStyle(style);
    if (t.style !== st) t.style = st;
    if (t.text !== text) t.text = text;
  }

  private metricsOf(style: RichStyle): Metrics {
    const key = styleKey(style);
    let m = this.metrics.get(key);
    if (!m) {
      const measured = CanvasTextMetrics.measureText('M', this.pixiStyle(style), undefined, false);
      m = { lineHeight: measured.lineHeight, ascent: measured.fontProperties.ascent };
      this.metrics.set(key, m);
    }
    return m;
  }

  private pixiStyle(style: RichStyle): TextStyle {
    const key = styleKey(style);
    let st = this.styles.get(key);
    if (!st) {
      const o = this.options;
      st = new TextStyle({
        fontFamily: o.fontFamily,
        fontSize: style.size ?? o.fontSize,
        fill: style.color ?? o.color ?? '#ffffff',
        fontWeight: style.bold ? 'bold' : 'normal',
        fontStyle: style.italic ? 'italic' : 'normal',
        ...(o.stroke ? { stroke: { color: o.stroke, width: o.strokeWidth ?? 1, join: 'round' as const } } : {}),
      });
      this.styles.set(key, st);
    }
    return st;
  }
}

export interface BitmapRichFontOptions extends RichFontOptions {
  /** Letters beyond ASCII the text prints (see `installLabelFont`). */
  glyphs?: string;
}

/**
 * Runs as `BitmapText` from label fonts (`installLabelFont`): changing the text costs no canvas and no upload, and the
 * runs batch. Each colour × size is a font of its own, baked the first time it is used — keep to a few and print each
 * once while loading, or the first line to use one bakes it on that frame. Bitmap fonts have no bold or italic: those
 * tags change nothing here.
 */
export class BitmapRichFont implements RichFont {
  private readonly styles = new Map<string, TextStyle>();
  private readonly metrics = new Map<string, Metrics>();

  constructor(private readonly options: BitmapRichFontOptions) {}

  textWidth(text: string, style: RichStyle): number {
    const layout = BitmapFontManager.measureText(text, this.pixiStyle(style), false);
    return layout.width * layout.scale;
  }

  lineHeight(style: RichStyle): number {
    return this.metricsOf(style).lineHeight;
  }

  ascent(style: RichStyle): number {
    return this.metricsOf(style).ascent;
  }

  createRun(): Container {
    return new BitmapText({ text: '', style: this.pixiStyle({ bold: false, italic: false }) });
  }

  updateRun(run: Container, text: string, style: RichStyle): void {
    const t = run as BitmapText;
    const st = this.pixiStyle(style);
    if (t.style !== st) t.style = st;
    if (t.text !== text) t.text = text;
  }

  private metricsOf(style: RichStyle): Metrics {
    const key = this.fontKey(style);
    let m = this.metrics.get(key);
    if (!m) {
      const st = this.pixiStyle(style);
      const font = BitmapFontManager.getFont('M', st);
      const scale = (st.fontSize as number) / font.baseMeasurementFontSize;
      m = { lineHeight: font.lineHeight * scale, ascent: font.fontMetrics.ascent * scale };
      this.metrics.set(key, m);
    }
    return m;
  }

  /** Bold and italic do not reach a bitmap font: styles differing only by them share one. */
  private fontKey(style: RichStyle): string {
    return `${style.color ?? ''}|${style.size ?? ''}`;
  }

  private pixiStyle(style: RichStyle): TextStyle {
    const key = this.fontKey(style);
    let st = this.styles.get(key);
    if (!st) {
      const o = this.options;
      const size = style.size ?? o.fontSize;
      const name = installLabelFont(o.fontFamily, size, style.color ?? o.color ?? '#ffffff', o.stroke ?? '#000000', o.strokeWidth ?? 0, o.resolution ?? 1, o.glyphs ?? '');
      st = new TextStyle({ fontFamily: name, fontSize: size });
      this.styles.set(key, st);
    }
    return st;
  }
}
