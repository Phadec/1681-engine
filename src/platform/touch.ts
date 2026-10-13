import { detectTouch, type TouchEnv } from '../input/touchDetect';

let cached: boolean | null = null;
let nativeShell = false;
let overrideKey = 'engine.touch';

/** A native shell (Capacitor, Electron touch kiosk…) tells the engine it is one; browsers leave it false. */
export function setNativeShell(native: boolean): void {
  nativeShell = native;
  cached = null;
}

/**
 * The `localStorage` key that forces the touch controls on or off (`'1'`/`'0'`, beside `?touch=1|0` in the URL), for
 * trying them on a desktop browser. A game names its own so its players' saved choice carries over.
 */
export function setTouchOverrideKey(key: string): void {
  overrideKey = key;
  cached = null;
}

function readOverride(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('touch');
    if (fromUrl !== null) return fromUrl;
    return localStorage.getItem(overrideKey);
  } catch {
    return null;
  }
}

function readEnv(): TouchEnv {
  return {
    native: nativeShell,
    coarse: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    touchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints ?? 0 : 0,
    override: readOverride(),
  };
}

/** True when the game is played with fingers (decided once per launch, `detectTouch`). */
export function isTouchUi(): boolean {
  if (cached === null) cached = typeof window !== 'undefined' && detectTouch(readEnv());
  return cached;
}
