import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Which patched web a pointer names, and whether it ever came up. */
export interface WebPointer {
  version: string;
  shell: string;
  /** The page reported booting from it at least once. */
  booted: boolean;
  /** Starts it was loaded on without booting. */
  tries: number;
}

/** `active`: in use; `pending`: built, put in use on the next start; `previous`: the last web that booted before `active`. */
export type PointerName = 'active' | 'pending' | 'previous';

/** The pointer files beside the patched webs (`<root>/<name>.json`), read and written whole. */
export class WebPointers {
  constructor(private readonly root: string) {}

  read(name: PointerName): WebPointer | null {
    try {
      const p = JSON.parse(readFileSync(this.file(name), 'utf8')) as WebPointer;
      if (typeof p?.version !== 'string' || typeof p.shell !== 'string') return null;
      return { version: p.version, shell: p.shell, booted: p.booted === true, tries: typeof p.tries === 'number' ? p.tries : 0 };
    } catch {
      return null;
    }
  }

  write(name: PointerName, p: WebPointer | null): void {
    if (p) {
      mkdirSync(this.root, { recursive: true });
      writeFileSync(this.file(name), JSON.stringify(p));
    } else rmSync(this.file(name), { force: true });
  }

  private file(name: PointerName): string {
    return join(this.root, `${name}.json`);
  }
}
