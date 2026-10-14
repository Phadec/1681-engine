/** Steps that bring saved data forward one schema version each: `migrations[n]` turns version n into n + 1. */
export type Migrations = Readonly<Record<number, (data: unknown) => unknown>>;

/** Why data could not be brought to the current version. */
export class MigrationError extends Error {
  constructor(
    message: string,
    readonly reason: 'too-new' | 'no-migration' | 'migration-failed',
    readonly fromVersion: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'MigrationError';
  }
}

/**
 * Runs the chain from `from` up to `to`, one step at a time, so a save three versions old goes through every step
 * written since rather than needing a direct path from each old version. Data newer than the game (a save from a
 * later build, then a downgrade) is refused rather than read wrong.
 */
export function migrateSave(data: unknown, from: number, to: number, migrations: Migrations): unknown {
  if (!Number.isInteger(from) || from > to) {
    throw new MigrationError(`save version ${from} is newer than this build reads (${to})`, 'too-new', from);
  }
  let value = data;
  for (let v = from; v < to; v++) {
    const step = migrations[v];
    if (!step) throw new MigrationError(`no migration from save version ${v} to ${v + 1}`, 'no-migration', from);
    try {
      value = step(value);
    } catch (err) {
      throw new MigrationError(`migration from save version ${v} failed`, 'migration-failed', from, { cause: err });
    }
  }
  return value;
}
