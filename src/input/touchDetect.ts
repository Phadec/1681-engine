/** What decides whether the touch controls are shown; read off the browser by `touchDevice.ts`. */
export interface TouchEnv {
  /** Running inside the native shell (Capacitor iOS). */
  native: boolean;
  /** `(pointer: coarse)` matches: the **primary** pointer is a finger. */
  coarse: boolean;
  /** `navigator.maxTouchPoints`. */
  touchPoints: number;
  /** `?touch=1|0` in the URL or `localStorage['engine.touch']`, for trying the controls on a desktop browser. */
  override: string | null;
}

/**
 * Touch controls only where a finger is the main way in: the native app always, a browser whose primary pointer
 * is coarse and that reports touch points (a phone or tablet), never a desktop — a laptop with a touch screen
 * still has a fine primary pointer and keeps its mouse and keyboard.
 */
export function detectTouch(env: TouchEnv): boolean {
  if (env.override === '1' || env.override === 'on') return true;
  if (env.override === '0' || env.override === 'off') return false;
  if (env.native) return true;
  return env.coarse && env.touchPoints > 0;
}
