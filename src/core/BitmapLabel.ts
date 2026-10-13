import { BitmapFont, BitmapText, DynamicBitmapFont } from 'pixi.js';
import { GameObject } from './gameObject';

const INSTALLED = new Set<string>();

/**
 * The glyphs baked into every label font: printable ASCII plus whatever a game adds (`addLabelGlyphs`) for the words
 * its labels print, so no glyph is baked mid-frame onto a fresh page (a new canvas a page, and iOS hands out none
 * once its canvas memory is spent).
 */
const CHARS: (string | [string, string])[] = [[' ', '~']];

/** Adds letters every label font bakes ahead (accented letters of a language the labels print). Call before `installLabelFont`. */
export function addLabelGlyphs(letters: string): void {
  CHARS.push(letters);
}
/**
 * The side of one glyph page in CSS pixels; a page's canvas is this × the resolution. Pixi's default, 512, made every
 * label font a 2048² canvas at resolution 4 (16 MB each, ten of them at boot); the numbers' glyphs fill a few pages of
 * this size instead.
 */
const PAGE_SIZE = 128;

/**
 * Rasterises one label font once and returns its name. Called ahead of time for the damage numbers
 * : baking a font on its first number froze the first frame that printed one by ~60 ms.
 */
export function installLabelFont(fontFamily: string, size: number, color: string, stroke: string, strokeWidth: number, resolution: number): string {
  const name = `label|${fontFamily}|${size}|${color}|${stroke}|${strokeWidth}|${resolution}`;
  if (!INSTALLED.has(name)) {
    // `install` takes no page size of its own: it reads the dynamic font's default, set for this call only
    const defaults = DynamicBitmapFont.defaultOptions;
    const was = defaults.textureSize;
    defaults.textureSize = PAGE_SIZE;
    try {
      BitmapFont.install({
        name,
        chars: CHARS,
        resolution,
        style: { fontFamily, fontSize: size, fill: color, stroke: { color: stroke, width: strokeWidth, join: 'round' } },
      });
    } finally {
      defaults.textureSize = was;
    }
    INSTALLED.add(name);
  }
  return name;
}

/**
 * Text drawn from a bitmap font: the glyphs are rasterised once per font, so changing the string costs no canvas
 * redraw and no texture upload, and every label of one font batches with the others. For the floating numbers, which
 * a crowded fight throws dozens of a second — a plain `Text` repaints its canvas at resolution 4 and uploads it on
 * every change.
 */
export class BitmapLabel extends GameObject(BitmapText) {
  /**
   * `fontFamily` must already be loaded (`document.fonts.load`), or the glyphs bake in the fallback.
   * Styled like `worldText`: the same font, size, colour and outline, rasterised at the same resolution.
   */
  constructor(x: number, y: number, text: string, fontFamily: string, size: number, color: string, stroke: string, strokeWidth: number, resolution: number) {
    const name = installLabelFont(fontFamily, size, color, stroke, strokeWidth, resolution);
    super({ text, style: { fontFamily: name, fontSize: size } });
    this.position.set(x, y);
  }

  setOrigin(x = 0.5, y = x): this {
    this.anchor.set(x, y);
    return this;
  }

  setText(text: string): this {
    this.text = text;
    return this;
  }
}
