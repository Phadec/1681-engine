import type { Renderer } from 'pixi.js';

function glOf(renderer: Renderer): WebGLRenderingContext | undefined {
  return (renderer as { gl?: WebGLRenderingContext }).gl;
}

/**
 * The largest texture side the GPU takes (WebGL's MAX_TEXTURE_SIZE), or null when the renderer is not WebGL. Many
 * phones stop at 4096, so an atlas planned for 8192 must split its pages there (`atlasPageLimit`).
 */
export function maxTextureSize(renderer: Renderer): number | null {
  const gl = glOf(renderer);
  if (!gl) return null;
  const n = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The GPU's own name where the browser gives it (WEBGL_debug_renderer_info), else null; for telling devices apart. */
export function gpuName(renderer: Renderer, max = 80): string | null {
  try {
    const gl = glOf(renderer);
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0, max) : null;
  } catch {
    return null;
  }
}
