/** One fault the frame guard (or a system) caught. */
export interface LoggedError {
  where: string;
  message: string;
  /** How many times in a row the same fault came in. */
  count: number;
  at: number;
}

/**
 * The last `limit` distinct faults, newest last. A fault repeating every frame is one entry with a count, not
 * sixty lines a second pushing everything else out.
 */
export class ErrorLog {
  readonly entries: LoggedError[] = [];

  constructor(readonly limit = 10) {}

  add(where: string, error: unknown, at = Date.now()): void {
    const message = error instanceof Error ? error.message : String(error);
    const last = this.entries[this.entries.length - 1];
    if (last && last.where === where && last.message === message) {
      last.count++;
      last.at = at;
      return;
    }
    this.entries.push({ where, message, count: 1, at });
    if (this.entries.length > this.limit) this.entries.shift();
  }

  clear(): void {
    this.entries.length = 0;
  }
}
