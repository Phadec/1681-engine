import type { Renderer } from 'pixi.js';

/**
 * Every draw entry point of a WebGL context. On WebGL1 Pixi puts `drawElementsInstanced`/`drawArraysInstanced` on the
 * context itself, forwarding to ANGLE_instanced_arrays, so wrapping the context counts instanced draws on both
 * versions. `drawRangeElements` (WebGL2) is unused by Pixi but counted for a renderer of a game's own.
 */
const DRAW_CALLS = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements'] as const;

/**
 * Counts WebGL draw calls by wrapping the context's draw functions while it is installed, since Pixi 8 keeps no
 * count of its own. Installed only while the debug overlay is open, so a closed overlay costs nothing; on WebGPU
 * (no `gl`) it counts nothing and says so.
 */
export class DrawCallCounter {
  /** Draw calls since the last `take`. */
  private calls = 0;
  private restore: (() => void) | null = null;

  constructor(private readonly renderer: Renderer) {}

  /** Whether this renderer can be counted (WebGL). */
  get supported(): boolean {
    return glOf(this.renderer) !== null;
  }

  install(): void {
    const gl = glOf(this.renderer);
    if (!gl || this.restore) return;
    const target = gl as unknown as Record<string, unknown>;
    const saved: [string, unknown, unknown][] = [];
    let counting = true;
    for (const name of DRAW_CALLS) {
      const fn = target[name];
      if (typeof fn !== 'function') continue;
      const wrapper = (...args: unknown[]) => {
        if (counting) this.calls++;
        return (fn as (...a: unknown[]) => unknown).apply(gl, args);
      };
      saved.push([name, fn, wrapper]);
      target[name] = wrapper;
    }
    this.restore = () => {
      // only where ours is still the function: a probe that wrapped after us keeps working (it then calls ours,
      // which still forwards to the original and no longer counts)
      counting = false;
      for (const [name, fn, wrapper] of saved) if (target[name] === wrapper) target[name] = fn;
    };
  }

  uninstall(): void {
    this.restore?.();
    this.restore = null;
  }

  /** Draw calls since the last call, and starts counting again. */
  take(): number {
    const n = this.calls;
    this.calls = 0;
    return n;
  }
}

function glOf(renderer: Renderer): WebGL2RenderingContext | WebGLRenderingContext | null {
  const gl = (renderer as unknown as { gl?: WebGL2RenderingContext | WebGLRenderingContext }).gl;
  return gl ?? null;
}
