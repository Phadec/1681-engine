import type { SaveBackend } from './SaveBackend';

/** Slots kept in a map for the life of the page: for tests, tools and a browser that refuses storage. */
export class MemoryBackend implements SaveBackend {
  readonly entries = new Map<string, string>();

  async read(key: string): Promise<string | null> {
    return this.entries.get(key) ?? null;
  }

  async write(key: string, value: string): Promise<void> {
    this.entries.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async keys(prefix: string): Promise<string[]> {
    return [...this.entries.keys()].filter((k) => k.startsWith(prefix));
  }
}
