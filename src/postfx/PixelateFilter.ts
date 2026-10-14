import { FxFilter } from './fxShader';

/** Shows the screen in blocks of `size` pixels: a transition's dissolve, a retro mode, a censor box. 1 is off. */
export class PixelateFilter extends FxFilter {
  constructor(size = 4) {
    super({
      name: 'pixelate',
      uniforms: { uSize: { type: 'f32', value: size } },
      glsl: `
  float s = max(uSize, 1.0);
  vec2 px = coord / texel;
  result = sampleAt((floor(px / s) + 0.5) * s * texel);`,
      wgsl: `
  let s = max(fx.uSize, 1.0);
  let px = coord / texel;
  result = sampleAt((floor(px / s) + 0.5) * s * texel);`,
    });
  }

  get size(): number {
    return this.num('uSize');
  }
  set size(v: number) {
    this.set('uSize', v);
  }
}
