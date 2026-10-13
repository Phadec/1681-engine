/*
 * How hard a landed blow feels. Pure, so the numbers
 * can be pinned: the freeze-frame grows with the share of the body's health the blow took, a crit holds longer, and the
 * body struck is knocked a pixel or three away from whoever struck it — less the bigger it is.
 */

/** The freeze-frame of a blow (ms): 40 for a scratch, up to 140 for one that took a third of the body; a crit +40. */
export function hitStopMs(share: number, crit: boolean): number {
  const base = Math.min(140, 40 + Math.max(0, share) * 400);
  return Math.round(base + (crit ? 40 : 0));
}

/** How far the body struck recoils away from the blow (whole world px): a heavy body barely, a crit a pixel further. */
export function recoilPx(heavy: boolean, share: number, crit: boolean): number {
  if (heavy) return crit ? 2 : 1;
  return Math.min(3, 2 + (share > 0.2 ? 1 : 0) + (crit ? 1 : 0));
}

/** How long a recoil takes to settle back (ms). */
export const RECOIL_MS = 120;

/** The recoil left at `t` (0 the blow, 1 settled): out at once, eased back, whole pixels only. */
export function recoilAt(px: number, t: number): number {
  if (t >= 1 || px <= 0) return 0;
  return Math.round(px * (1 - t) * (1 - t));
}

/** The least time between two white flashes on a heavy body (ms). */
export const HEAVY_FLASH_GAP_MS = 400;

/**
 * How long the body struck flashes white (ms), 0 for none: 70, a crit of one's own 140 (the impact frame), nothing with
 * `reduce` (a "reduce flashes" setting). A heavy body (a boss, anything drawn large) flashes only for the local
 * player's own crit, 60 ms, `HEAVY_FLASH_GAP_MS` apart: a sheet covering most of the screen turning white on every
 * blow, beat and tick is a strobe. Sparks, numbers and the recoil still mark every blow.
 */
export function hurtFlashMs(heavy: boolean, impact: boolean, reduce: boolean): number {
  if (reduce) return 0;
  if (heavy) return impact ? 60 : 0;
  return impact ? 140 : 70;
}

/** The gap a body keeps between two flashes (ms). */
export function hurtFlashGapMs(heavy: boolean): number {
  return heavy ? HEAVY_FLASH_GAP_MS : 0;
}
