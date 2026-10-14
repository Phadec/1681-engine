import { FxFilter } from './fxShader';

export interface ShockwaveOptions {
  /** Ring's width as a share of the screen's height (default 0.06). */
  width?: number;
  /** How far the ring pushes the picture, screen pixels (default 12). */
  amplitude?: number;
}

/**
 * A ring that bends the picture as it passes: an explosion's blast, a landing's thump. Set `centerX/Y` (0–1 across the
 * filtered area) and grow `radius` (a share of its height) over time; `PostFx.shockwave` does both and removes it.
 */
export class ShockwaveFilter extends FxFilter {
  constructor(options: ShockwaveOptions = {}) {
    super({
      name: 'shockwave',
      uniforms: {
        uCenter: { type: 'vec2<f32>', value: new Float32Array([0.5, 0.5]) },
        uRadius: { type: 'f32', value: 0 },
        uWidth: { type: 'f32', value: options.width ?? 0.06 },
        uAmplitude: { type: 'f32', value: options.amplitude ?? 12 },
      },
      glsl: `
  vec2 d = (frameUv - uCenter) * vec2(framePx.x / framePx.y, 1.0);
  float dist = length(d);
  float x = (dist - uRadius) / max(uWidth, 0.0001);
  if (abs(x) < 1.0 && dist > 0.0) {
    float wave = sin(x * 3.14159265) * (1.0 - abs(x));
    result = sampleAt(coord - (d / dist) * wave * uAmplitude * texel);
  }`,
      wgsl: `
  let d = (frameUv - fx.uCenter) * vec2<f32>(framePx.x / framePx.y, 1.0);
  let dist = length(d);
  let x = (dist - fx.uRadius) / max(fx.uWidth, 0.0001);
  if (abs(x) < 1.0 && dist > 0.0) {
    let wave = sin(x * 3.14159265) * (1.0 - abs(x));
    result = sampleAt(coord - (d / dist) * wave * fx.uAmplitude * texel);
  }`,
    });
  }

  setCenter(x: number, y: number): void {
    this.set('uCenter', x, y);
  }
  get radius(): number {
    return this.num('uRadius');
  }
  set radius(v: number) {
    this.set('uRadius', v);
  }
  get amplitude(): number {
    return this.num('uAmplitude');
  }
  set amplitude(v: number) {
    this.set('uAmplitude', v);
  }
}
