export type StoreListener<T> = (state: T, previous: T) => void;

/**
 * A tiny shared state store between the game and its UI, framework-free. Same shape as the engine's settings store
 * and as zustand's vanilla stores (`getState`, `setState`, `subscribe`), so React reads it with
 * `useSyncExternalStore(store.subscribe, store.getState)`.
 */
export interface Store<T extends object> {
  getState(): T;
  /**
   * Merges a patch (or what a function of the state returns) into a new state object. A patch that changes nothing
   * notifies nobody: a game may set the player's health every frame and the UI renders only when it moved.
   */
  setState(patch: Partial<T> | ((state: T) => Partial<T>)): void;
  /** Calls `listener` after every change; the returned function unsubscribes. */
  subscribe(listener: StoreListener<T>): () => void;
  /** Calls `listener` only when `select(state)` changes (by `equals`, default `Object.is`). */
  select<S>(select: (state: T) => S, listener: (value: S, previous: S) => void, equals?: (a: S, b: S) => boolean): () => void;
  /** Back to the state it was made with. */
  reset(): void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  // replaced, never edited, on (un)subscribe: setState walks it without a copy, and a listener that unsubscribes
  // while it runs does not shift the walk
  let listeners: readonly StoreListener<T>[] = [];

  const store: Store<T> = {
    getState: () => state,
    setState(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k in p) {
        if (!Object.is(p[k], state[k])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      const previous = state;
      state = { ...state, ...p };
      for (const l of listeners) l(state, previous);
    },
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
    select(select, listener, equals = Object.is) {
      let current = select(state);
      return store.subscribe((s) => {
        const next = select(s);
        if (equals(next, current)) return;
        const previous = current;
        current = next;
        listener(next, previous);
      });
    },
    reset() {
      const previous = state;
      state = initial;
      if (previous !== initial) for (const l of listeners) l(state, previous);
    },
  };
  return store;
}
