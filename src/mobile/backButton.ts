/** A back handler: true when it used the press (closed a dialog, went up a menu), false to let the next one try. */
export type BackHandler = () => boolean;

/**
 * Who answers Android's back button (and the back gesture): the most recently pushed handler first, then the ones
 * under it, then `onRoot` when none took it. A dialog pushes "close me" when it opens and pops it when it closes; a
 * pause menu pushes "resume"; the title screen leaves the press to `onRoot`, which by default asks for a second press
 * to quit, so a stray swipe never ends a run.
 */
export class BackStack {
  private readonly handlers: BackHandler[] = [];

  constructor(private readonly onRoot: () => void = () => undefined) {}

  /** Puts `handler` on top; the returned function takes it off (from anywhere in the stack). */
  push(handler: BackHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const i = this.handlers.lastIndexOf(handler);
      if (i >= 0) this.handlers.splice(i, 1);
    };
  }

  get size(): number {
    return this.handlers.length;
  }

  /** A back press: offered from the top down; `onRoot` when none uses it. True when a handler used it. */
  press(): boolean {
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      if (this.handlers[i]!()) return true;
    }
    this.onRoot();
    return false;
  }
}

export interface DoubleBackOptions {
  /** A second press within this (ms) quits (default 2000). */
  withinMs?: number;
  /** The first press: tell the player ("press back again to quit"). */
  notify: () => void;
  /** The second: leave (Capacitor's `App.exitApp`, or `minimizeApp` to keep the game alive in the background). */
  exit: () => void;
  now?: () => number;
}

/** An `onRoot` that quits on a second back press soon after the first, and tells the player after the first. */
export function doubleBackToExit(options: DoubleBackOptions): () => void {
  const within = options.withinMs ?? 2000;
  const now = options.now ?? (() => Date.now());
  let first = -Infinity;
  return () => {
    const t = now();
    if (t - first <= within) {
      first = -Infinity;
      options.exit();
      return;
    }
    first = t;
    options.notify();
  };
}
