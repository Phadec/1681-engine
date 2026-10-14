/**
 * Locks the screen's orientation where the platform allows it: Android Chrome in fullscreen or as an installed app,
 * Electron and Capacitor shells. Desktop browsers and iPhone Safari refuse or lack the API; then `lockOrientation`
 * resolves false, so a game asks once and falls back to a "turn your phone" hint without try/catch of its own.
 */

export type OrientationLock = 'any' | 'natural' | 'landscape' | 'portrait' | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary';

/** The slice of `ScreenOrientation` used here (`lock` is missing from some DOM typings); tests pass their own. */
export interface OrientationTarget {
  readonly type?: string;
  lock?(orientation: OrientationLock): Promise<void>;
  unlock?(): void;
}

function currentOrientation(): OrientationTarget | null {
  if (typeof screen === 'undefined' || !screen.orientation) return null;
  return screen.orientation as unknown as OrientationTarget;
}

/** Resolves true once the screen is locked to `orientation`, false where the platform refuses or cannot. */
export async function lockOrientation(orientation: OrientationLock, target: OrientationTarget | null = currentOrientation()): Promise<boolean> {
  if (!target || typeof target.lock !== 'function') return false;
  try {
    await target.lock(orientation);
    return true;
  } catch {
    // NotSupportedError on desktop, SecurityError outside fullscreen: both mean "not now", never a fault
    return false;
  }
}

/** Lets the screen turn freely again; a no-op where nothing could be locked. */
export function unlockOrientation(target: OrientationTarget | null = currentOrientation()): void {
  try {
    target?.unlock?.();
  } catch {
    // some browsers throw when nothing was locked
  }
}

/** 'landscape', 'portrait', or null where the platform does not say. */
export function currentOrientationKind(target: OrientationTarget | null = currentOrientation()): 'landscape' | 'portrait' | null {
  const type = target?.type ?? '';
  if (type.startsWith('landscape')) return 'landscape';
  if (type.startsWith('portrait')) return 'portrait';
  return null;
}
