import { FxFilter } from './fxShader';

export interface CrtOptions {
  /** 0–1, how dark the gaps between scanlines are (default 0.3). */
  scanlines?: number;
  /** Screen pixels per scanline (default 3). */
  lineHeight?: number;
  /** How much the glass bulges, 0 flat (default 0.08). */
  curvature?: number;
  /** 0–1, how much darker the bulged corners are (default 0.25). */
  cornerShade?: number;
}

/** An old television: scanlines, a bulging glass with black beyond its edge, darker corners. */
export class CrtFilter extends FxFilter {
  constructor(options: CrtOptions = {}) {
    super({
      name: 'crt',
      uniforms: {
        uScanlines: { type: 'f32', value: options.scanlines ?? 0.3 },
        uLineHeight: { type: 'f32', value: options.lineHeight ?? 3 },
        uCurvature: { type: 'f32', value: options.curvature ?? 0.08 },
        uCornerShade: { type: 'f32', value: options.cornerShade ?? 0.25 },
      },
      glsl: `
  vec2 c = frameUv * 2.0 - 1.0;
  c = c * (1.0 + uCurvature * (c.yx * c.yx));
  vec2 uv = c * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    result = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    result = sampleAt(toCoord(uv));
    float line = 0.5 + 0.5 * cos(uv.y * framePx.y / max(uLineHeight, 1.0) * 6.2831853);
    float shade = 1.0 - uCornerShade * dot(c, c) * 0.5;
    result = vec4(result.rgb * mix(1.0, line, uScanlines) * shade, result.a);
  }`,
      wgsl: `
  var c = frameUv * 2.0 - 1.0;
  c = c * (1.0 + fx.uCurvature * (c.yx * c.yx));
  let uv2 = c * 0.5 + 0.5;
  if (uv2.x < 0.0 || uv2.y < 0.0 || uv2.x > 1.0 || uv2.y > 1.0) {
    result = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  } else {
    result = sampleAt(toCoord(uv2));
    let line = 0.5 + 0.5 * cos(uv2.y * framePx.y / max(fx.uLineHeight, 1.0) * 6.2831853);
    let shade = 1.0 - fx.uCornerShade * dot(c, c) * 0.5;
    result = vec4<f32>(result.rgb * mix(1.0, line, fx.uScanlines) * shade, result.a);
  }`,
    });
  }
}
