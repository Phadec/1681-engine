export interface ListWidthOptions {
  /** Added to the longest label: the row's padding, a check mark, a scroll bar (default 0). */
  padding?: number;
  min?: number;
  max?: number;
}

/**
 * How wide a drop-down list (or a menu) must be so its longest label fits: measured, not guessed, so no label is
 * clipped. `measure` is the caller's (a canvas `measureText`, a bitmap font's advance sum). Rounded up to a whole
 * pixel so the measurement never loses the last half pixel of a letter.
 */
export function listWidth(labels: readonly string[], measure: (label: string) => number, options: ListWidthOptions = {}): number {
  let widest = 0;
  for (const l of labels) widest = Math.max(widest, measure(l));
  const w = Math.ceil(widest + (options.padding ?? 0));
  return Math.min(options.max ?? Infinity, Math.max(options.min ?? 0, w));
}
