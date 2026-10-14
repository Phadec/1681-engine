import type { WebFile, WebManifest } from './manifest';

/** What building a new web takes, given the files a client already holds. */
export interface WebPlan {
  /** Files taken from the web held now: `from` is their path there. */
  copy: { path: string; from: string }[];
  /** Files to fetch from `<channel>/files/<sha256>`; content shared by several paths appears once per path. */
  download: WebFile[];
  /** Bytes to download, each distinct content counted once. */
  bytes: number;
}

/**
 * What to copy and what to download for `target`, given the web held now (`have`: path → sha256): a file whose path
 * holds the same content is copied from there, one whose content lies under another path (a bundler renamed it) is
 * copied from that path, and only content found nowhere is downloaded — once, however many paths share it. This is
 * what makes a patch cost only what changed, the way a game launcher patches.
 */
export function planWeb(target: WebManifest, have: ReadonlyMap<string, string>): WebPlan {
  const byHash = new Map<string, string>();
  for (const [path, sha] of have) if (!byHash.has(sha)) byHash.set(sha, path);
  const copy: WebPlan['copy'] = [];
  const download: WebFile[] = [];
  const fetched = new Set<string>();
  let bytes = 0;
  for (const f of target.files) {
    const there = byHash.get(f.sha256);
    if (have.get(f.path) === f.sha256) copy.push({ path: f.path, from: f.path });
    else if (there !== undefined) copy.push({ path: f.path, from: there });
    else {
      download.push(f);
      if (!fetched.has(f.sha256)) {
        fetched.add(f.sha256);
        bytes += f.size;
      }
    }
  }
  return { copy, download, bytes };
}
