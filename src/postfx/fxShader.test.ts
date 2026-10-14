import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glslSource, rgb, wgslSource, type FxShaderSpec } from './fxShader.ts';

const spec: FxShaderSpec = {
  name: 'test',
  uniforms: { uAmount: { type: 'f32', value: 1 }, uTint: { type: 'vec3<f32>', value: new Float32Array(3) } },
  glsl: 'result = src * uAmount;',
  wgsl: 'result = src * fx.uAmount;',
};

test('the GLSL source declares each uniform with its GLSL type and wraps the body', () => {
  const s = glslSource(spec);
  assert.match(s, /uniform float uAmount;/);
  assert.match(s, /uniform vec3 uTint;/);
  assert.match(s, /result = src \* uAmount;\s*finalColor = result;/);
  assert.doesNotMatch(s, /uMap/);
});

test('the WGSL source puts the uniforms in a struct at group 1 and adds the map only when asked', () => {
  const s = wgslSource(spec);
  assert.match(s, /struct FxUniforms \{\n {2}uAmount: f32,\n {2}uTint: vec3<f32>,\n\};/);
  assert.match(s, /@group\(1\) @binding\(0\) var<uniform> fx: FxUniforms;/);
  assert.doesNotMatch(s, /uMap/);
  const withMap = wgslSource({ ...spec, map: true });
  assert.match(withMap, /@group\(1\) @binding\(1\) var uMap: texture_2d<f32>;/);
  assert.match(glslSource({ ...spec, map: true }), /uniform sampler2D uMap;/);
});

test('rgb splits a colour into 0–1 channels', () => {
  assert.deepEqual(rgb(0xff8000), [1, 128 / 255, 0]);
});
