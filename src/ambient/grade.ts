/**
 * The pure half of a colour grade: how strong a place's colour is laid at a point of the day, and the multiply colour
 * that leaves the same result. `ColorGrade` draws it.
 */

/** A place's grade: its colour (0xRRGGBB) and how strongly it is laid by day and by night (0..1). */
export interface Grade {
  color: number;
  day: number;
  night: number;
}

export interface GradeState {
  color: number;
  alpha: number;
}

/**
 * The grade at `night` (0 by day, 1 at full night, `DayClock`'s `night`), never past `max`: a grade is a light
 * tint, and one laid too strong washes every sprite toward one colour.
 */
export function gradeAt(grade: Grade, night: number, max = 0.14): GradeState {
  const n = Math.max(0, Math.min(1, night));
  return { color: grade.color, alpha: Math.max(0, Math.min(max, grade.day + (grade.night - grade.day) * n)) };
}

/** `color` taken `share` of the way from white: what a multiply sheet of that colour at that opacity leaves. */
export function mixToWhite(color: number, share: number): number {
  const s = Math.max(0, Math.min(1, share));
  const ch = (shift: number) => Math.round(255 - (255 - ((color >> shift) & 255)) * s) << shift;
  return ch(16) | ch(8) | ch(0);
}
