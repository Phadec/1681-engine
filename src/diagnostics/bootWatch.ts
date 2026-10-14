/** What `bootWatch` reports when a start hangs. */
export interface BootStall {
  /** The step the start stood on. */
  step: string;
  /** Every step reached, in order, with the ms since the watch began when each was reached. */
  steps: { name: string; atMs: number }[];
  /** `stuck: <step>`, a line short enough for a player's screenshot. */
  detail: string;
}

export interface BootWatch {
  /** Moves the watch on to a named step. */
  step(name: string): void;
  /** The start finished: the watch stops. */
  done(): void;
}

/**
 * Says when a start has not finished `ms` after it began, naming the step it stood on. A world that never got built
 * otherwise leaves the player looking at a loading line forever while the rest of the page goes on under it; named
 * steps turn "it hangs" into "it hangs loading textures".
 */
export function bootWatch(ms: number, onStuck: (stall: BootStall) => void, now: () => number = () => performance.now()): BootWatch {
  const began = now();
  const steps = [{ name: 'init', atMs: 0 }];
  let finished = false;
  const timer = setTimeout(() => {
    if (finished) return;
    const step = steps[steps.length - 1]!.name;
    onStuck({ step, steps: steps.slice(), detail: `stuck: ${step}` });
  }, ms);
  return {
    step(name: string) {
      if (!finished) steps.push({ name, atMs: Math.round(now() - began) });
    },
    done() {
      finished = true;
      clearTimeout(timer);
    },
  };
}
