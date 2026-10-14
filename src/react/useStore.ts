import { useCallback, useSyncExternalStore } from 'react';
import type { Store } from '../ui/dom/createStore';

/**
 * Reads an engine `Store` (`createStore`) in a component and renders again when what it reads changes. `select`
 * must return something stable (a field, a number), not a new object each call, or React renders forever.
 */
export function useStore<T extends object>(store: Store<T>): T;
export function useStore<T extends object, S>(store: Store<T>, select: (state: T) => S): S;
export function useStore<T extends object, S>(store: Store<T>, select?: (state: T) => S): T | S {
  const get = useCallback(() => (select ? select(store.getState()) : store.getState()), [store, select]);
  return useSyncExternalStore(store.subscribe, get, get);
}
