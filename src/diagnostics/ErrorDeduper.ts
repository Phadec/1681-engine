/**
 * Lets through each distinct error once, and only so many in all: a loop throwing every frame is one report, not
 * sixty a second. Errors are told apart by the first `keyLength` characters of their message.
 */
export class ErrorDeduper {
  private readonly seen = new Set<string>();

  constructor(
    private readonly max = 10,
    private readonly keyLength = 120,
  ) {}

  /** The key to report under, or null when this error was already let through or the allowance is spent. */
  admit(message: string): string | null {
    const key = message.slice(0, this.keyLength);
    if (this.seen.has(key) || this.seen.size >= this.max) return null;
    this.seen.add(key);
    return key;
  }

  /** Forgets what was let through (a new session). */
  reset(): void {
    this.seen.clear();
  }
}

/** The first `lines` lines of a stack, at most `max` characters. */
export function trimStack(stack: string | undefined, lines = 4, max = 600): string {
  return (stack ?? '').split('\n').slice(0, lines).join('\n').slice(0, max);
}
