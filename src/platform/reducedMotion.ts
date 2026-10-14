import { engineSettings } from '../settings';

/**
 * The player's "reduce motion" system setting (`prefers-reduced-motion: reduce`), read live. Games often want to
 * honour it for screen shake, flashes and heavy particles; `followReducedMotion` mirrors it into the engine's own
 * `reducedFx` setting so everything that already reads that follows the system.
 */

const QUERY = '(prefers-reduced-motion: reduce)';

/** The slice of `MediaQueryList` used here; tests pass their own. */
export interface MotionQuery {
  readonly matches: boolean;
  addEventListener?(type: 'change', fn: () => void): void;
  removeEventListener?(type: 'change', fn: () => void): void;
  /** Safari before 14 only has the old names. */
  addListener?(fn: () => void): void;
  removeListener?(fn: () => void): void;
}

function currentQuery(): MotionQuery | null {
  return typeof matchMedia === 'function' ? matchMedia(QUERY) : null;
}

/** True when the system asks for reduced motion; false where it cannot be read. */
export function prefersReducedMotion(query: MotionQuery | null = currentQuery()): boolean {
  return query?.matches === true;
}

/** Calls `fn(reduced)` when the system setting changes (not at once). Returns the unsubscribe. */
export function onReducedMotionChange(fn: (reduced: boolean) => void, query: MotionQuery | null = currentQuery()): () => void {
  if (!query) return () => {};
  const handler = () => fn(query.matches);
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handler);
    return () => query.removeEventListener?.('change', handler);
  }
  query.addListener?.(handler);
  return () => query.removeListener?.(handler);
}

/**
 * Sets `engineSettings.reducedFx` from the system setting now and whenever it changes. Returns the unsubscribe; the
 * setting keeps its last value afterwards. A game with its own "reduced effects" toggle should not call this, or
 * the system would overwrite the player's choice — mirror its own store instead.
 */
export function followReducedMotion(query: MotionQuery | null = currentQuery()): () => void {
  if (!query) return () => {};
  engineSettings.set({ reducedFx: query.matches });
  return onReducedMotionChange((reduced) => engineSettings.set({ reducedFx: reduced }), query);
}
