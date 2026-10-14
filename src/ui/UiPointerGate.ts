import { Pointer } from '../core/Pointer';

/** The native events a UI widget took: a WeakSet, so an event is forgotten with the event itself. */
const consumed = new WeakSet<object>();
let installed = 0;
let previous: ((e: PointerEvent) => boolean) | null = null;
let gate: ((e: PointerEvent) => boolean) | null = null;

/**
 * Keeps a press on a canvas widget from also counting as a press in the world.
 *
 * Pixi's event system listens on the canvas in the capture phase, so it hit-tests the widgets and runs their
 * `pointerdown` handlers before `Pointer`'s own listener on the same canvas sees the event. A widget marks the native
 * event (`consume`), and the gate, chained into `Pointer.ignorePress`, tells `Pointer` to leave that press out. A
 * game's own `ignorePress` keeps working: the gate asks it too.
 */
export const UiPointerGate = {
  /** Marks a native event (a federated event's `nativeEvent`) as taken by the UI. */
  consume(e: object | null | undefined): void {
    if (e) consumed.add(e);
  },

  /** Whether the UI took this native event (a game's own canvas listener may ask too). */
  wasConsumed(e: object | null | undefined): boolean {
    return !!e && consumed.has(e);
  },

  /** Chains the gate into `Pointer.ignorePress`; counted, so two UI roots install it once. Returns the uninstall. */
  install(): () => void {
    if (installed++ === 0) {
      previous = Pointer.ignorePress;
      gate = (e) => consumed.has(e) || (previous?.(e) ?? false);
      Pointer.ignorePress = gate;
    }
    let done = false;
    return () => {
      if (done) return;
      done = true;
      if (--installed > 0) return;
      // give back what was there, unless the game replaced the hook after us (then it owns it)
      if (Pointer.ignorePress === gate) Pointer.ignorePress = previous;
      previous = null;
      gate = null;
    };
  },
};
