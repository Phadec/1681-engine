import { useMemo } from 'react';
import type { Store } from '../ui/dom/createStore';
import { useStore } from './useStore';

/** A store hook that selects (zustand's `useStore`, or `(sel) => useStore(store, sel)`). */
export type SelectingHook<S> = (select: (state: S) => string) => string;

/**
 * Selects a small, plain piece of a store by its content: the selector's result is compared as JSON, so a store that
 * hands out a fresh array or object for unchanged content — a game's player state pushed several times a second in a
 * fight — re-renders nothing that reads it, and the value returned keeps its reference until the content changes.
 * Only for small data (a few ids, a list of buffs): the JSON is written once per store change.
 */
export function useJsonSelector<S, T>(useHook: SelectingHook<S>, select: (state: S) => T): T {
  const key = useHook((state) => JSON.stringify(select(state)) ?? 'null');
  return useMemo(() => JSON.parse(key) as T, [key]);
}

/** `useJsonSelector` over an engine `Store` (`createStore`). */
export function useStoreJson<S extends object, T>(store: Store<S>, select: (state: S) => T): T {
  return useJsonSelector<S, T>((sel) => useStore(store, sel), select);
}
