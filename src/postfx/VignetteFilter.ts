import { FxFilter, rgb } from './fxShader';

export interface VignetteOptions {
  /** 0–1, how dark the corners go (default 0.5). */
  strength?: number;
  /** Where the darkening starts, as a share of the way from the centre to a corner (default 0.55). */
  radius?: number;
  /** How far beyond `radius` it reaches full strength (default 0.45). */
  softness?: number;
  /** What the edges fade to (default black); a red one is a classic low-health warning. */
  color?: number;
}

/** Darkens the edges of the screen towards a colour, round whatever its shape. */
export class VignetteFilter extends FxFilter {
  constructor(options: VignetteOptions = {}) {
    super({
      name: 'vignette',
      uniforms: {
        uStrength: { type: 'f32', value: options.strength ?? 0.5 },
        uRadius: { type: 'f32', value: options.radius ?? 0.55 },
        uSoftness: { type: 'f32', value: options.softness ?? 0.45 },
        uColor: { type: 'vec3<f32>', value: new Float32Array(rgb(options.color ?? 0)) },
      },
      glsl: `
  vec2 aspect = vec2(framePx.x / framePx.y, 1.0);
  float dist = length((frameUv - 0.5) * aspect) / length(aspect * 0.5);
  float v = smoothstep(uRadius, uRadius + max(uSoftness, 0.0001), dist) * uStrength;
  result = vec4(mix(src.rgb, uColor * src.a, v), src.a);`,
      wgsl: `
  let aspect = vec2<f32>(framePx.x / framePx.y, 1.0);
  let dist = length((frameUv - 0.5) * aspect) / length(aspect * 0.5);
  let v = smoothstep(fx.uRadius, fx.uRadius + max(fx.uSoftness, 0.0001), dist) * fx.uStrength;
  result = vec4<f32>(mix(src.rgb, fx.uColor * src.a, v), src.a);`,
    });
  }

  get strength(): number {
    return this.num('uStrength');
  }
  set strength(v: number) {
    this.set('uStrength', v);
  }

  set color(c: number) {
    this.set('uColor', ...rgb(c));
  }
}
