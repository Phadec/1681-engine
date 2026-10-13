/**
 * Which keys are held, by `KeyboardEvent.code` (the physical key, so WASD stays WASD on any layout). `pressed` and
 * `released` report edges since the last `endStep`; call that once per simulation step so a tap shorter than a frame
 * is still seen by exactly one step.
 */
export class Keyboard {
  private readonly held = new Set<string>();
  private readonly down = new Set<string>();
  private readonly up = new Set<string>();
  private readonly cleanup: (() => void)[] = [];

  constructor(target: Window | HTMLElement = window) {
    const keydown = (e: Event) => {
      const k = (e as KeyboardEvent).code;
      if ((e as KeyboardEvent).repeat || this.held.has(k)) return;
      this.held.add(k);
      this.down.add(k);
    };
    const keyup = (e: Event) => {
      const k = (e as KeyboardEvent).code;
      if (!this.held.delete(k)) return;
      this.up.add(k);
    };
    // a key held while the window loses focus never sends its keyup: let everything go
    const blur = () => {
      for (const k of this.held) this.up.add(k);
      this.held.clear();
    };
    target.addEventListener('keydown', keydown);
    target.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    this.cleanup.push(
      () => target.removeEventListener('keydown', keydown),
      () => target.removeEventListener('keyup', keyup),
      () => window.removeEventListener('blur', blur),
    );
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** Any of these keys is held. */
  anyDown(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  /** Went down since the last `endStep`. */
  pressed(code: string): boolean {
    return this.down.has(code);
  }

  /** Came up since the last `endStep`. */
  released(code: string): boolean {
    return this.up.has(code);
  }

  /** -1, 0 or 1 from two sets of keys: `axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight'])`. */
  axis(negative: string[], positive: string[]): number {
    return (this.anyDown(...positive) ? 1 : 0) - (this.anyDown(...negative) ? 1 : 0);
  }

  /** Forgets this step's edges; held keys stay held. */
  endStep(): void {
    this.down.clear();
    this.up.clear();
  }

  destroy(): void {
    for (const fn of this.cleanup.splice(0)) fn();
    this.held.clear();
    this.endStep();
  }
}
