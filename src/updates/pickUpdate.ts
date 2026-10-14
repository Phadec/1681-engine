import { fileUrl, isNewer, isSha256, safePath, type LatestJson, type WebManifest } from './manifest';

/** A web a client may take: its version, its manifest's full URL and the native build it needs. */
export interface WebBundle {
  version: string;
  manifestUrl: string;
  minNative: number;
}

/**
 * The web to take from `latest`: newer than the web running (`webVersion`), and needing no native code this app lacks
 * (`nativeBuild` ≥ the web's `minNative`). A browser or desktop build with no native layer passes `Infinity`.
 */
export function pickWebUpdate(latest: LatestJson, channelUrl: string, webVersion: string, nativeBuild: number): WebBundle | null {
  const w = latest.web;
  if (!w || !isNewer(latest.version, webVersion) || nativeBuild < w.minNative) return null;
  return { version: latest.version, manifestUrl: `${channelUrl}/${w.manifest}`, minNative: w.minNative };
}

/** A newer build than this one, and where its Android package downloads from. */
export interface NewerRelease {
  version: string;
  apkUrl: string;
}

/**
 * The build's APK, when it is newer than this client and its web cannot come over the air instead (`webBundle` is
 * what {@link pickWebUpdate} found): the package is the slow road, for native changes.
 */
export function apkUpdateOf(latest: LatestJson, channelUrl: string, clientVersion: string, webBundle: WebBundle | null): NewerRelease | null {
  if (webBundle || !latest.apk || !isNewer(latest.version, clientVersion)) return null;
  return { version: latest.version, apkUrl: `${channelUrl}/${latest.apk.file}` };
}

/** One entry of a multi-file bundle download, in the shape `@capgo/capacitor-updater`'s `ManifestEntry` takes. */
export interface PluginEntry {
  file_name: string;
  file_hash: string;
  download_url: string;
}

/**
 * A phone updater's download list for `manifest`, or null when the manifest is not one to trust (another version, an
 * unsafe or repeated path, a bad hash, no `index.html`). The updater checks each file against its hash and reuses
 * every file it already holds, so only new content is fetched.
 */
export function pluginEntries(manifest: unknown, version: string, channelUrl: string): PluginEntry[] | null {
  const m = manifest as WebManifest;
  if (!m || m.version !== version || !Array.isArray(m.files)) return null;
  const out: PluginEntry[] = [];
  const seen = new Set<string>();
  for (const f of m.files) {
    if (!f || typeof f.path !== 'string' || !safePath(f.path) || seen.has(f.path) || !isSha256(f.sha256)) return null;
    seen.add(f.path);
    out.push({ file_name: f.path, file_hash: f.sha256, download_url: fileUrl(channelUrl, f.sha256) });
  }
  return seen.has('index.html') ? out : null;
}

/**
 * A copy of `bundle` the updater already holds whole (downloaded and checked, applied or waiting), so asking again —
 * a settings screen's check after the login screen's — takes it instead of downloading the same files twice.
 */
export function heldBundle<T extends { version: string; status: string }>(held: readonly T[], bundle: WebBundle): T | null {
  return held.find((b) => b.version === bundle.version && (b.status === 'pending' || b.status === 'success')) ?? null;
}
