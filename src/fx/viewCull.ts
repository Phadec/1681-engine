/** What `inView` reads off the main camera (Camera's own fields; a fake stage may lack them). */
export interface CameraLike {
  zoom: number;
  scrollX?: number;
  scrollY?: number;
  width?: number;
  height?: number;
}

/**
 * Whether the world point (x, y) lies within `margin` world pixels of the screen. Effects use it to skip painting what
 * nobody can see. A camera that has no size yet (a tool's fake stage, before the first resize) counts everything in.
 */
export function inView(cam: CameraLike, x: number, y: number, margin: number): boolean {
  const w = cam.width;
  const h = cam.height;
  if (!w || !h || !(cam.zoom > 0)) return true;
  const left = cam.scrollX ?? 0;
  const top = cam.scrollY ?? 0;
  return x >= left - margin && y >= top - margin && x <= left + w / cam.zoom + margin && y <= top + h / cam.zoom + margin;
}
