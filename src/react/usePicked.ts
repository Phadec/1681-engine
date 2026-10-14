import { useState } from 'react';

/**
 * Which entry of a list is picked for a `SplitPane`'s detail, by key. While nothing is picked — or the picked entry
 * is gone (sold, used up) — the first one stands in, so the detail is never empty while the list is not; `auto: false`
 * leaves it empty instead (a letter must not be opened, and so marked read, without the player choosing it).
 */
export function usePicked<T>(items: readonly T[], key: (item: T) => string, auto = true): [T | null, (id: string | null) => void] {
  const [picked, setPicked] = useState<string | null>(null);
  return [pickedEntry(items, key, picked, auto), setPicked];
}

/** `usePicked`'s rule, pure. */
export function pickedEntry<T>(items: readonly T[], key: (item: T) => string, picked: string | null, auto = true): T | null {
  const found = picked === null ? undefined : items.find((it) => key(it) === picked);
  return found ?? (auto ? (items[0] ?? null) : null);
}
