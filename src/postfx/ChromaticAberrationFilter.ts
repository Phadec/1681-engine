import { FxFilter } from './fxShader';

/**
 * Splits red and blue apart towards the edges, `offset` pixels at a corner: a hit's jolt, a dream, a cheap lens.
 * Nothing at the centre of the screen moves.
 */
export class ChromaticAberrationFilter extends FxFilter {
  constructor(offset = 2) {
    super({
      name: 'chromatic-aberration',
      uniforms: { uOffset: { type: 'f32', value: offset } },
      glsl: `
  vec2 off = (frameUv - 0.5) * 2.0 * uOffset * texel;
  result = vec4(sampleAt(coord + off).r, src.g, sampleAt(coord - off).b, src.a);`,
      wgsl: `
  let off = (frameUv - 0.5) * 2.0 * fx.uOffset * texel;
  result = vec4<f32>(sampleAt(coord + off).r, src.g, sampleAt(coord - off).b, src.a);`,
    });
  }

  get offset(): number {
    return this.num('uOffset');
  }
  set offset(v: number) {
    this.set('uOffset', v);
  }
}
