/**
 * The shapes of a release store's feed for file-by-file web updates, and the rules for trusting one. One definition
 * for every client that reads it: the desktop shell's patcher (`1681-engine/electron`), a browser build and the phone
 * apps' over-the-air updater. A publish script writes, per channel:
 *
 * - `<channel>/latest.json` ({@link LatestJson}): the newest build and where its pieces lie, as paths under the channel,
 *   written last so a client never reads a release that is half up;
 * - `<channel>/web/<version>.json` ({@link WebManifest}): every file of the built web with its sha256;
 * - `<channel>/files/<sha256>`: each content once, so a release uploads and a client downloads only what is new.
 *
 * Kept pure (no Node, no DOM, no Electron) so a phone's web view and an Electron main process share it.
 */

/** One file of a built web, as the manifest lists it. */
export interface WebFile {
  /** Relative to the web's root, forward slashes (`assets/index-3f2a.js`). */
  path: string;
  /** Lower-case hex sha256 of the content; also its name under `<channel>/files/`. */
  sha256: string;
  size: number;
}

/** `<channel>/web/<version>.json`. */
export interface WebManifest {
  version: string;
  /**
   * The desktop shell this web needs (`shellId` in `1681-engine/electron`): a web talks to its shell through a
   * preload script and may need what a newer shell adds, so any other shell takes the installer instead.
   */
  shell: string;
  /** The lowest native build of the phone apps this web needs: a web calling a plugin the app lacks must never reach it. */
  minNative: number;
  files: WebFile[];
}

/** A packaged download listed in `latest.json` (an APK, an installer). */
export interface ReleaseFile {
  file: string;
  size: number;
  sha256?: string;
}

/** `<channel>/latest.json`. */
export interface LatestJson {
  version: string;
  date?: string;
  /** The build's web: its manifest's path under the channel, the shell and native build it needs. */
  web?: { manifest: string; shell: string; minNative: number };
  /** The Android package, when the channel publishes one. */
  apk?: { file: string; size: number; sha256: string };
  /** Desktop installers by platform key (the publisher names the keys, e.g. `win`, `macArm`, `macX64`). */
  desktop?: Record<string, ReleaseFile | undefined>;
}

/** Whether version `a` ("0.5.23", "v0.5.23") is newer than `b`, number by number; a missing part counts 0. */
export function isNewer(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/**
 * A path a manifest may name: relative, forward slashes, no `.` or `..` segment, no NUL — nothing that could write
 * outside the web's own folder once joined to it.
 */
export function safePath(p: string): boolean {
  if (!p || p.startsWith('/') || p.includes('\\') || p.includes('\0')) return false;
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

const SHA256 = /^[0-9a-f]{64}$/;

/** Whether `s` is a lower-case hex sha256. */
export function isSha256(s: unknown): s is string {
  return typeof s === 'string' && SHA256.test(s);
}

/**
 * A manifest whose shape may be trusted: every path safe and listed once, every hash a sha256, every size a number,
 * and an `index.html` (a web without one cannot be loaded, and a truncated upload is the usual way to get one).
 */
export function validManifest(m: unknown): m is WebManifest {
  const x = m as WebManifest;
  if (!x || typeof x.version !== 'string' || typeof x.shell !== 'string' || !Array.isArray(x.files)) return false;
  const seen = new Set<string>();
  for (const f of x.files) {
    if (!f || typeof f.path !== 'string' || !safePath(f.path) || seen.has(f.path)) return false;
    if (!isSha256(f.sha256) || typeof f.size !== 'number') return false;
    seen.add(f.path);
  }
  return seen.has('index.html');
}

/** Where a content lies in the store: `<channelUrl>/files/<sha256>`. */
export function fileUrl(channelUrl: string, sha256: string): string {
  return `${channelUrl}/files/${sha256}`;
}
