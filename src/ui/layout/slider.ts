import { clamp } from './geometry';

/** A value held to the range and to the nearest `step` above `min` (no step: any value). */
export function quantize(value: number, min: number, max: number, step = 0): number {
  const v = clamp(value, min, max);
  if (step <= 0) return v;
  const q = min + Math.round((v - min) / step) * step;
  // the last step may overshoot max when the range is not a whole number of steps
  return clamp(Number(q.toFixed(10)), min, max);
}

/** Where `value` sits along the range, 0–1. */
export function sliderFraction(value: number, min: number, max: number): number {
  return max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
}

/** The value under a pointer at `px` on a track starting at `trackStart`, `trackLength` long. */
export function sliderValueAt(px: number, trackStart: number, trackLength: number, min: number, max: number, step = 0): number {
  const f = trackLength > 0 ? clamp((px - trackStart) / trackLength, 0, 1) : 0;
  return quantize(min + f * (max - min), min, max, step);
}
