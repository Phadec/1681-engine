import { detectTouch, type TouchEnv } from '../input/touchDetect';

let cached: boolean | null = null;
let nativeShell = false;

/** A native shell (Capacitor, Electron touch kiosk…) tells the engine it is one; browsers leave it false. */
export function setNativeShell(native: boolean): void {
  nativeShell = native;
  cached = null;
}

function readOverride(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('touch');
    if (fromUrl !== null) return fromUrl;
    return localStorage.getItem('engine.touch');
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
