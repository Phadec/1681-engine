import { Filter, GlProgram, GpuProgram, Texture, UniformGroup } from 'pixi.js';

/** The uniform types an effect may declare. */
export type FxUniformType = 'f32' | 'vec2<f32>' | 'vec3<f32>' | 'vec4<f32>';

export interface FxUniform {
  type: FxUniformType;
  value: number | Float32Array;
}

export type FxUniforms = Record<string, FxUniform>;

/**
 * One effect's shader: its uniforms, and the body of its fragment function in GLSL (WebGL 2) and WGSL (WebGPU).
 *
 * Both bodies are given the same helpers, so they read alike:
 * - `frameUv` (vec2): 0–1 across the filtered area, whatever the size of the texture Pixi hands over;
 * - `framePx` (vec2): the filtered area's size in pixels; `texel` (vec2): one input pixel in texture coordinates;
 * - `sampleAt(coord)`: the input at a texture coordinate, clamped inside the area; `toCoord(uv)`: frame uv back to one;
 * - `coord`: this fragment's texture coordinate; `src`: the input there (premultiplied alpha);
 * - `uMap` / `sampleMap(coord)` when the effect has a second texture (`map: true`).
 * GLSL reads its uniforms by name; WGSL through `fx.<name>`. Each body ends by writing `result`.
 */
export interface FxShaderSpec {
  name: string;
  uniforms: FxUniforms;
  glsl: string;
  wgsl: string;
  /** A second texture the effect samples (bloom's blurred light). */
  map?: boolean;
}

const GLSL_TYPE: Record<FxUniformType, string> = { f32: 'float', 'vec2<f32>': 'vec2', 'vec3<f32>': 'vec3', 'vec4<f32>': 'vec4' };

const VERTEX_GLSL = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

/** The GLSL fragment shader of an effect. */
export function glslSource(spec: FxShaderSpec): string {
  const decl = Object.entries(spec.uniforms)
    .map(([n, u]) => `uniform ${GLSL_TYPE[u.type]} ${n};`)
    .join('\n');
  return `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
${spec.map ? 'uniform sampler2D uMap;' : ''}
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
${decl}
vec4 sampleAt(vec2 c) { return texture(uTexture, clamp(c, uInputClamp.xy, uInputClamp.zw)); }
${spec.map ? 'vec4 sampleMap(vec2 c) { return texture(uMap, clamp(c, uInputClamp.xy, uInputClamp.zw)); }' : ''}
vec2 toCoord(vec2 uv) { return uv * uOutputFrame.zw * uInputSize.zw; }
void main(void) {
  vec2 coord = vTextureCoord;
  vec2 framePx = uOutputFrame.zw;
  vec2 frameUv = coord * uInputSize.xy / framePx;
  vec2 texel = uInputSize.zw;
  vec4 src = texture(uTexture, coord);
  vec4 result = src;
${spec.glsl}
  finalColor = result;
}
`;
}

/** The WGSL module of an effect (vertex and fragment). */
export function wgslSource(spec: FxShaderSpec): string {
  const fields = Object.entries(spec.uniforms)
    .map(([n, u]) => `  ${n}: ${u.type},`)
    .join('\n');
  return `struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};
struct FxUniforms {
${fields}
};
@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> fx: FxUniforms;
${spec.map ? '@group(1) @binding(1) var uMap: texture_2d<f32>;' : ''}
struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return VSOutput(vec4<f32>(position, 0.0, 1.0), aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw));
}
fn sampleAt(c: vec2<f32>) -> vec4<f32> { return textureSampleLevel(uTexture, uSampler, clamp(c, gfu.uInputClamp.xy, gfu.uInputClamp.zw), 0.0); }
${spec.map ? 'fn sampleMap(c: vec2<f32>) -> vec4<f32> { return textureSampleLevel(uMap, uSampler, clamp(c, gfu.uInputClamp.xy, gfu.uInputClamp.zw), 0.0); }' : ''}
fn toCoord(uv: vec2<f32>) -> vec2<f32> { return uv * gfu.uOutputFrame.zw * gfu.uInputSize.zw; }
@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let coord = uv;
  let framePx = gfu.uOutputFrame.zw;
  let frameUv = coord * gfu.uInputSize.xy / framePx;
  let texel = gfu.uInputSize.zw;
  let src = textureSampleLevel(uTexture, uSampler, coord, 0.0);
  var result = src;
${spec.wgsl}
  return result;
}
`;
}

/**
 * A full-screen effect built from an `FxShaderSpec`: a Pixi `Filter` whose uniforms are read and written by name
 * (`fx.set('strength', 0.5)`, or the subclasses' own properties). Works on both renderers.
 */
export class FxFilter extends Filter {
  readonly fxName: string;
  private readonly group: UniformGroup;

  constructor(spec: FxShaderSpec) {
    const uniforms: Record<string, { value: number | Float32Array; type: FxUniformType }> = {};
    for (const [n, u] of Object.entries(spec.uniforms)) uniforms[n] = { value: typeof u.value === 'number' ? u.value : new Float32Array(u.value), type: u.type };
    const group = new UniformGroup(uniforms);
    const wgsl = wgslSource(spec);
    super({
      // highp: the uniforms the vertex shader shares with it must match its precision, or the program will not link
      glProgram: GlProgram.from({ vertex: VERTEX_GLSL, fragment: glslSource(spec), name: `fx-${spec.name}`, preferredFragmentPrecision: 'highp' }),
      gpuProgram: GpuProgram.from({ vertex: { source: wgsl, entryPoint: 'mainVertex' }, fragment: { source: wgsl, entryPoint: 'mainFragment' } }),
      resources: spec.map ? { fxUniforms: group, uMap: Texture.WHITE.source } : { fxUniforms: group },
      // as sharp as the canvas: a pixel game's effects land on its own pixels
      resolution: 'inherit',
    });
    this.fxName = spec.name;
    this.group = group;
  }

  /** A uniform's value (a number, or the live array of a vector). */
  get(name: string): number | Float32Array {
    return this.group.uniforms[name] as number | Float32Array;
  }

  /** Sets a number uniform, or the components of a vector one. */
  set(name: string, ...values: number[]): this {
    const u = this.group.uniforms as Record<string, number | Float32Array>;
    const cur = u[name];
    if (cur === undefined) throw new Error(`${this.fxName}: no uniform '${name}'`);
    if (typeof cur === 'number') u[name] = values[0] ?? 0;
    else for (let i = 0; i < cur.length && i < values.length; i++) cur[i] = values[i]!;
    this.group.update();
    return this;
  }

  /** A number uniform, for the subclasses' getters. */
  protected num(name: string): number {
    return this.group.uniforms[name] as number;
  }
}

/** A 0xRRGGBB colour as three 0–1 channels. */
export function rgb(color: number): [number, number, number] {
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}
