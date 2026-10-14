import { FxFilter, rgb } from './fxShader';

export interface ColorAdjustOptions {
  /** Multiplies every channel (default 1). */
  brightness?: number;
  /** 1 unchanged, 0 flat grey, above 1 punchier (default 1). */
  contrast?: number;
  /** 1 unchanged, 0 greyscale (default 1). */
  saturation?: number;
  /** A colour multiplied in by `tintAmount` (default white, 0). */
  tint?: number;
  tintAmount?: number;
}

/**
 * Brightness, contrast, saturation and a tint, all animatable, plus a flash: the whole screen washed towards a colour
 * (`flash` 0–1, `flashColor`), for a hit, a pickup or lightning. `PostFx.flash` drives it.
 */
export class ColorAdjustFilter extends FxFilter {
  constructor(options: ColorAdjustOptions = {}) {
    super({
      name: 'color-adjust',
      uniforms: {
        uBrightness: { type: 'f32', value: options.brightness ?? 1 },
        uContrast: { type: 'f32', value: options.contrast ?? 1 },
        uSaturation: { type: 'f32', value: options.saturation ?? 1 },
        uTintAmount: { type: 'f32', value: options.tintAmount ?? 0 },
        uTint: { type: 'vec3<f32>', value: new Float32Array(rgb(options.tint ?? 0xffffff)) },
        uFlash: { type: 'f32', value: 0 },
        uFlashColor: { type: 'vec3<f32>', value: new Float32Array([1, 1, 1]) },
      },
      glsl: `
  vec3 c = src.a > 0.0 ? src.rgb / src.a : src.rgb;
  c *= uBrightness;
  c = (c - 0.5) * uContrast + 0.5;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSaturation);
  c = mix(c, c * uTint, uTintAmount);
  c = mix(c, uFlashColor, uFlash);
  result = vec4(clamp(c, 0.0, 1.0) * src.a, src.a);`,
      wgsl: `
  var c = src.rgb;
  if (src.a > 0.0) { c = src.rgb / src.a; }
  c = c * fx.uBrightness;
  c = (c - 0.5) * fx.uContrast + 0.5;
  let l = dot(c, vec3<f32>(0.299, 0.587, 0.114));
  c = mix(vec3<f32>(l), c, fx.uSaturation);
  c = mix(c, c * fx.uTint, fx.uTintAmount);
  c = mix(c, fx.uFlashColor, fx.uFlash);
  result = vec4<f32>(clamp(c, vec3<f32>(0.0), vec3<f32>(1.0)) * src.a, src.a);`,
    });
  }

  get brightness(): number {
    return this.num('uBrightness');
  }
  set brightness(v: number) {
    this.set('uBrightness', v);
  }
  get contrast(): number {
    return this.num('uContrast');
  }
  set contrast(v: number) {
    this.set('uContrast', v);
  }
  get saturation(): number {
    return this.num('uSaturation');
  }
  set saturation(v: number) {
    this.set('uSaturation', v);
  }
  get flash(): number {
    return this.num('uFlash');
  }
  set flash(v: number) {
    this.set('uFlash', v);
  }
  set flashColor(c: number) {
    this.set('uFlashColor', ...rgb(c));
  }
  set tint(c: number) {
    this.set('uTint', ...rgb(c));
  }
  get tintAmount(): number {
    return this.num('uTintAmount');
  }
  set tintAmount(v: number) {
    this.set('uTintAmount', v);
  }
}
