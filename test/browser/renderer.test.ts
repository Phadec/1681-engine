import { expect, test } from 'vitest';

test('WebGL 2 is there (SwiftShader), so the pixel tests run on a real GL context', () => {
  const gl = document.createElement('canvas').getContext('webgl2');
  expect(gl).not.toBe(null);
  const info = gl!.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  expect(name.toLowerCase()).toContain('swiftshader');
});
