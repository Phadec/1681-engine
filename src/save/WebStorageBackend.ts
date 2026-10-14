import type { SaveBackend } from './SaveBackend';

/**
 * Slots in a Web Storage area, `localStorage` by default. Small and synchronous, so keep saves to a few hundred KB:
 * browsers allow about 5 MB a site, and a write over that throws (reported to the caller of `save`).
 */
export class WebStorageBackend implements SaveBackend {
  constructor(private readonly storage: Storage = globalThis.localStorage) {
    if (!storage) throw new Error('WebStorageBackend: no Web Storage here; pass one or use another backend');
  }

  async read(key: string): Promise<string | null> {
    return this.storage.getItem(key);
  }

  async write(key: string, value: string): Promise<void> {
    this.storage.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    this.storage.removeItem(key);
  }

  async keys(prefix: string): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k !== null && k.startsWith(prefix)) out.push(k);
    }
    return out;
  }
}
