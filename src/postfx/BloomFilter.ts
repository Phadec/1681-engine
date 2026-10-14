import { BlurFilter, TexturePool, type FilterSystem, type RenderSurface, type Texture } from 'pixi.js';
import { FxFilter } from './fxShader';

export interface BloomOptions {
  /** Brightness (0–1, the brightest channel) from which a pixel glows (default 0.7). */
  threshold?: number;
  /** How gradually the glow comes in above the threshold (default 0.2). */
  knee?: number;
  /** How strongly the glow is added back (default 1). */
  intensity?: number;
  /** Blur strength of the glow, pixels (default 8). */
  blur?: number;
  /** Blur quality: passes (default 4). */
  quality?: number;
}

/** The bright pass: what is above the threshold, the rest black. */
class BrightPass extends FxFilter {
  constructor(threshold: number, knee: number) {
    super({
      name: 'bloom-bright',
      uniforms: { uThreshold: { type: 'f32', value: threshold }, uKnee: { type: 'f32', value: knee } },
      glsl: `
  vec3 c = src.a > 0.0 ? src.rgb / src.a : src.rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + max(uKnee, 0.0001), l);
  result = src * k;`,
      wgsl: `
  var c = src.rgb;
  if (src.a > 0.0) { c = src.rgb / src.a; }
  let l = max(c.r, max(c.g, c.b));
  let k = smoothstep(fx.uThreshold, fx.uThreshold + max(fx.uKnee, 0.0001), l);
  result = src * k;`,
    });
  }
}

/**
 * Bright things glow: the pixels above a threshold are blurred and added back over the picture. Three passes (bright,
 * blur, combine) on textures from Pixi's pool; costlier than the one-pass effects, so give it a `filterArea` or put it
 * on the world layer only.
 */
export class BloomFilter extends FxFilter {
  private readonly bright: BrightPass;
  private readonly blurPass: BlurFilter;

  constructor(options: BloomOptions = {}) {
    super({
      name: 'bloom',
      map: true,
      uniforms: { uIntensity: { type: 'f32', value: options.intensity ?? 1 } },
      glsl: `
  result = src + sampleMap(coord) * uIntensity;`,
      wgsl: `
  result = src + sampleMap(coord) * fx.uIntensity;`,
    });
    this.bright = new BrightPass(options.threshold ?? 0.7, options.knee ?? 0.2);
    this.blurPass = new BlurFilter({ strength: options.blur ?? 8, quality: options.quality ?? 4 });
  }

  get intensity(): number {
    return this.num('uIntensity');
  }
  set intensity(v: number) {
    this.set('uIntensity', v);
  }
  get threshold(): number {
    return this.bright.get('uThreshold') as number;
  }
  set threshold(v: number) {
    this.bright.set('uThreshold', v);
  }
  get blur(): number {
    return this.blurPass.strength;
  }
  set blur(v: number) {
    this.blurPass.strength = v;
  }

  override apply(filterManager: FilterSystem, input: Texture, output: RenderSurface, clearMode: boolean): void {
    const light = TexturePool.getSameSizeTexture(input);
    const glow = TexturePool.getSameSizeTexture(input);
    this.bright.apply(filterManager, input, light, true);
    this.blurPass.apply(filterManager, light, glow, true);
    this.resources.uMap = glow.source;
    filterManager.applyFilter(this, input, output, clearMode);
    TexturePool.returnTexture(glow);
    TexturePool.returnTexture(light);
  }

  override destroy(): void {
    this.bright.destroy();
    this.blurPass.destroy();
    super.destroy();
  }
}
