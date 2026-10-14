import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Lower-case hex sha256. */
export const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');

/** Every file under `dir`, as forward-slash paths relative to it. */
export async function listFiles(dir: string, base = ''): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(dir, rel)));
    else out.push(rel);
  }
  return out;
}

/** Every file of the web in `dir`, path → sha256. */
export async function hashWeb(dir: string): Promise<Map<string, string>> {
  const have = new Map<string, string>();
  for (const path of await listFiles(dir)) have.set(path, sha256(await readFile(join(dir, ...path.split('/')))));
  return have;
}

/** Writes `data` at the manifest path `path` under `dir`, making its folders. */
export async function putFile(dir: string, path: string, data: Uint8Array): Promise<void> {
  const file = join(dir, ...path.split('/'));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
}

/**
 * `fetch` that gives up after `ms` and never takes a cached answer: a store behind a CDN otherwise hands back
 * yesterday's `latest.json`, and a stalled connection would hold an update check open for good.
 */
export async function fetchWithTimeout(fetcher: typeof fetch, url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetcher(url, { signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}
