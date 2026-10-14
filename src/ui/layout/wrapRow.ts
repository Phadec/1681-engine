/**
 * Breaks a row of items (tabs, chips, buttons) into lines no wider than `maxWidth`: each line holds the indices of
 * its items in order. An item wider than the line still gets a line of its own rather than being dropped.
 */
export function wrapRow(widths: readonly number[], maxWidth: number, gap = 0): number[][] {
  const rows: number[][] = [];
  let row: number[] = [];
  let used = 0;
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i]!;
    const next = row.length === 0 ? w : used + gap + w;
    if (row.length > 0 && next > maxWidth) {
      rows.push(row);
      row = [i];
      used = w;
    } else {
      row.push(i);
      used = next;
    }
  }
  if (row.length > 0) rows.push(row);
  return rows;
}
