/**
 * Typed observer: listeners subscribe per event name and run in subscription order.
 * `Events` maps each event name to its payload, e.g. `EventBus<{ enemyKilled: { id: number } }>`.
 *
 * A listener that throws does not stop the ones after it; the error is handed to `onError` (the console by default).
 */
export class EventBus<Events extends object> {
  private readonly listeners = new Map<keyof Events, ((payload: never) => void)[]>();

  constructor(private readonly onError: (type: keyof Events, err: unknown) => void = (type, err) => console.error(`[events] ${String(type)} listener failed`, err)) {}

  /** Subscribes to `type`; returns the unsubscribe function. */
  on<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): () => void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    return () => this.off(type, fn);
  }

  /** Subscribes for the next `type` only. */
  once<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): () => void {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): void {
    const list = this.listeners.get(type);
    if (!list) return;
    const left = list.filter((f) => f !== fn);
    if (left.length) this.listeners.set(type, left);
    else this.listeners.delete(type);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    // the list is replaced, never mutated, on every (un)subscribe: walking this one is safe while listeners change it
    for (const fn of this.listeners.get(type) ?? []) {
      try {
        (fn as (payload: Events[K]) => void)(payload);
      } catch (err) {
        this.onError(type, err);
      }
    }
  }

  listenerCount(type: keyof Events): number {
    return this.listeners.get(type)?.length ?? 0;
  }

  clear(): void {
    this.listeners.clear();
  }
}
