/**
 * Gamepad rumble through the Gamepad Extensions' `vibrationActuator` (`'dual-rumble'`: Chrome, Edge, Firefox behind a
 * flag, Safari 16.4+). A pad without one, a browser without the API, or a refusal is a silent no-op that resolves
 * false: rumble is seasoning, never something a game should wait on or crash over.
 */

export interface RumbleOptions {
  /** The low-frequency (heavy) motor, 0–1 (default 0). */
  strong?: number;
  /** The high-frequency (light) motor, 0–1 (default 0). */
  weak?: number;
  /** How long it shakes (ms, default 200). */
  durationMs?: number;
  /** Wait before starting (ms, default 0). */
  startDelayMs?: number;
}

/** What rumble needs of a pad; `navigator.getGamepads()` entries satisfy it where the API exists. */
export interface RumblePad {
  readonly vibrationActuator?: {
    playEffect?(type: 'dual-rumble', params: { duration: number; startDelay: number; strongMagnitude: number; weakMagnitude: number }): Promise<unknown>;
    reset?(): Promise<unknown>;
  } | null;
}

/** 0–1, NaN as 0: actuators throw on a magnitude out of range. */
function unit(v: number | undefined): number {
  return v !== undefined && v > 0 ? Math.min(1, v) : 0;
}

/** The effect's parameters as the API wants them, clamped (pure, for tests and custom transports). */
export function rumbleParams(options: RumbleOptions): { duration: number; startDelay: number; strongMagnitude: number; weakMagnitude: number } {
  const duration = options.durationMs !== undefined && options.durationMs > 0 ? options.durationMs : 200;
  // browsers refuse effects past 5 s; clamp rather than lose the whole rumble
  return {
    duration: Math.min(5000, duration),
    startDelay: options.startDelayMs !== undefined && options.startDelayMs > 0 ? options.startDelayMs : 0,
    strongMagnitude: unit(options.strong),
    weakMagnitude: unit(options.weak),
  };
}

function navigatorPads(): readonly (RumblePad | null)[] {
  return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
    ? (navigator.getGamepads() as unknown as readonly (RumblePad | null)[])
    : [];
}

/** Rumbles one pad directly; resolves true when the effect played to its end. */
export async function rumblePad(pad: RumblePad | null | undefined, options: RumbleOptions): Promise<boolean> {
  const actuator = pad?.vibrationActuator;
  if (!actuator || typeof actuator.playEffect !== 'function') return false;
  const params = rumbleParams(options);
  if (params.strongMagnitude === 0 && params.weakMagnitude === 0) return false;
  try {
    const result = await actuator.playEffect('dual-rumble', params);
    // 'preempted' when another effect cut it short: it did play, so that is not a failure the game cares about
    return result === 'complete' || result === 'preempted' || result === undefined;
  } catch {
    return false;
  }
}

/** Rumbles the pad at `padIndex` (as in `navigator.getGamepads()`); resolves false where it cannot. */
export function rumble(padIndex: number, options: RumbleOptions, pads: () => readonly (RumblePad | null)[] = navigatorPads): Promise<boolean> {
  return rumblePad(pads()[padIndex], options);
}

/** Stops whatever the pad at `padIndex` is playing. */
export async function stopRumble(padIndex: number, pads: () => readonly (RumblePad | null)[] = navigatorPads): Promise<void> {
  try {
    await pads()[padIndex]?.vibrationActuator?.reset?.();
  } catch {
    // nothing to stop
  }
}
