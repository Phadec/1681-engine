import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** What goes into a shell's identity besides the runtime's version. */
export interface ShellIdOptions {
  /** Folders whose files (non-recursive) are hashed, in this order. */
  dirs: string[];
  /** Which files of each folder count; default the compiled main-process code, `*.cjs`. */
  match?: (fileName: string) => boolean;
  /** More text to fold in (an engine or framework version the main process bundles from elsewhere). */
  extra?: string[];
  /** Hex characters kept; default 16. */
  length?: number;
}

/**
 * A desktop shell's identity: a hash of the main process's own code and the Electron version it runs on. A web patch
 * is taken only by a shell with the same identity, because the web talks to the shell through its preload script and
 * may need what a newer shell adds; anything else comes with an installer. The publish script reckons it the same way
 * off the build it uploads, so nobody has to remember to raise a number when the shell changes.
 *
 * `shellId(version, dir)` hashes `dir`'s `*.cjs`; pass {@link ShellIdOptions} for more folders or other files. With one
 * folder, the default match and no `extra`, both forms give the same hash. Code the shell takes from `node_modules`
 * (this module included) is not in `dir`: name its version in `extra`, or a change there would not change the identity.
 */
export function shellId(electronVersion: string, dirOrOptions: string | ShellIdOptions): string {
  const o: ShellIdOptions = typeof dirOrOptions === 'string' ? { dirs: [dirOrOptions] } : dirOrOptions;
  const match = o.match ?? ((f: string) => f.endsWith('.cjs'));
  const h = createHash('sha256');
  h.update(`electron ${electronVersion}\n`);
  for (const dir of o.dirs) {
    for (const name of readdirSync(dir).filter(match).sort()) {
      h.update(`${name}\n`);
      h.update(readFileSync(join(dir, name)));
    }
  }
  for (const e of o.extra ?? []) h.update(`extra ${e}\n`);
  return h.digest('hex').slice(0, o.length ?? 16);
}
