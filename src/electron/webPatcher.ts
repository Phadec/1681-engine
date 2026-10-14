import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileUrl, isNewer, validManifest, type LatestJson } from '../updates/manifest';
import { planWeb } from '../updates/webPlan';
import { fetchWithTimeout, hashWeb, putFile, sha256 } from './webFiles';
import { WebPointers, type WebPointer } from './webPointers';

/** How a {@link WebPatcher} finds its webs and its store. */
export interface WebPatcherOptions {
  /** Where patched webs are built and kept, e.g. `join(app.getPath('userData'), 'web')`. */
  root: string;
  /** The web the installed build ships (the folder holding its `index.html`). */
  builtinDir: string;
  /** The installed build's version (`app.getVersion()`): a patched web must be newer to be loaded. */
  appVersion: string;
  /** This shell's identity (`shellId`), or a function reckoning it on first use. */
  shell: string | (() => string);
  /** The store's channel, e.g. `https://store.example/public/live`: `latest.json`, `web/…`, `files/…` lie under it. */
  channelUrl: string;
  /** False in a dev run: the built-in web is always loaded and nothing is read or tidied. Default true. */
  packaged?: boolean;
  /** Starts an unconfirmed web gets before it is dropped. Default 2. */
  maxTries?: number;
  /** Fall back to the last web that booted, rather than the built-in one, when a new web never boots. Default true. */
  keepPrevious?: boolean;
  /** The page file in a web. Default `index.html`. */
  entry?: string;
  /** Downloads at once. Default 6. */
  parallel?: number;
  /** Per request. Default 15 000 ms. */
  fetchTimeoutMs?: number;
  /** Default `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Where a failure to read the patched webs is reported. Default `console.error`. */
  log?: (...args: unknown[]) => void;
}

/**
 * A desktop shell that patches its web file by file, the way a game launcher does: the web a build ships is its
 * built-in copy, and every newer web is assembled beside it in `<root>/<version>/` from the files already held plus
 * only those whose content is new (`<channel>/files/<sha256>`, checked against their hash), then loaded in its place.
 * A web is taken only by a shell of the same identity; any other change needs an installer. A web that never reports
 * booting ({@link markBooted}, from the page) within `maxTries` starts is dropped, and the shell goes back to the last
 * web that did — or the built-in one — so a broken release cannot lock a player out.
 *
 * Use one per process: {@link startEntry} first (it decides which web this run loads), then the update calls.
 */
export class WebPatcher {
  private readonly o: Required<Omit<WebPatcherOptions, 'shell'>>;
  private readonly pointers: WebPointers;
  private shellValue: string | null = null;
  /** The web this run loads, and its version (the installed build's own when none is patched in). */
  private loaded: { dir: string; version: string } | null = null;
  /** The tidy a start began: a build waits for it, or it could delete the `.part` folder being filled. */
  private tidying: Promise<void> = Promise.resolve();
  private tidyChain: Promise<void> = Promise.resolve();

  constructor(private readonly options: WebPatcherOptions) {
    this.o = {
      root: options.root,
      builtinDir: options.builtinDir,
      appVersion: options.appVersion,
      channelUrl: options.channelUrl,
      packaged: options.packaged ?? true,
      maxTries: options.maxTries ?? 2,
      keepPrevious: options.keepPrevious ?? true,
      entry: options.entry ?? 'index.html',
      parallel: options.parallel ?? 6,
      fetchTimeoutMs: options.fetchTimeoutMs ?? 15_000,
      fetch: options.fetch ?? ((url, init) => globalThis.fetch(url, init)),
      log: options.log ?? ((...a) => console.error(...a)),
    };
    this.pointers = new WebPointers(options.root);
  }

  /** This shell's identity. */
  get shell(): string {
    const s = this.options.shell;
    this.shellValue ??= typeof s === 'string' ? s : s();
    return this.shellValue;
  }

  /** Where the window loads the page from: a patched web when there is a good one, else the built-in copy. */
  startEntry(): string {
    if (!this.o.packaged) {
      this.loaded = { dir: this.o.builtinDir, version: this.o.appVersion };
      return join(this.o.builtinDir, this.o.entry);
    }
    try {
      // a web built and left for later becomes the one in use on this start
      const pending = this.pointers.read('pending');
      if (this.usable(pending)) this.promote(pending, 0);
      this.pointers.write('pending', null);
      const active = this.pointers.read('active');
      if (this.usable(active) && (active.booted || active.tries < this.o.maxTries)) {
        if (!active.booted) this.pointers.write('active', { ...active, tries: active.tries + 1 });
        this.loaded = { dir: join(this.o.root, active.version), version: active.version };
      } else {
        // never booted, from another shell, or overtaken by an installer: back to the last good web, else the built-in
        if (active) this.pointers.write('active', null);
        const previous = this.pointers.read('previous');
        this.pointers.write('previous', null);
        if (this.o.keepPrevious && previous?.booted && this.usable(previous)) {
          this.pointers.write('active', previous);
          this.loaded = { dir: join(this.o.root, previous.version), version: previous.version };
        }
      }
    } catch (err) {
      this.o.log('[web] could not read the patched web, using the built-in one', err);
    }
    this.loaded ??= { dir: this.o.builtinDir, version: this.o.appVersion };
    this.tidying = this.tidy();
    return join(this.loaded.dir, this.o.entry);
  }

  /** The version of the web running now. */
  webVersion(): string {
    return this.loaded?.version ?? this.o.appVersion;
  }

  /** The page came up: the web it was loaded from is kept from now on. Call it from the page's own "booted" message. */
  markBooted(): void {
    const active = this.pointers.read('active');
    if (active && this.loaded && active.version === this.loaded.version && !active.booted) this.pointers.write('active', { ...active, booted: true });
  }

  /** The channel's newest build, or null when the store cannot be read. */
  async latest(): Promise<LatestJson | null> {
    try {
      const res = await fetchWithTimeout(this.o.fetch, `${this.o.channelUrl}/latest.json`, this.o.fetchTimeoutMs);
      if (!res.ok) return null;
      const l = (await res.json()) as LatestJson;
      return typeof l?.version === 'string' ? l : null;
    } catch {
      return null;
    }
  }

  /** Whether `l`'s web can be patched in here rather than installed: newer than the web running, for this shell. */
  patchable(l: LatestJson): boolean {
    return !!l.web && l.web.shell === this.shell && isNewer(l.version, this.webVersion());
  }

  /**
   * Builds `l`'s web beside the one running: the files held are copied, the rest downloaded and checked, into
   * `<version>.part/`, which becomes `<version>/` and the pending web once whole — a crash mid-way never leaves a
   * folder that looks finished. `onProgress` gets 0–100. Resolves with the version built; throws on any failure.
   */
  async prepare(l: LatestJson, onProgress: (percent: number) => void = () => undefined): Promise<string> {
    if (!l.web) throw new Error('no web in this release');
    const res = await fetchWithTimeout(this.o.fetch, `${this.o.channelUrl}/${l.web.manifest}`, this.o.fetchTimeoutMs);
    if (!res.ok) throw new Error(`web manifest ${res.status}`);
    const target: unknown = await res.json();
    if (!validManifest(target) || target.version !== l.version || target.shell !== this.shell) throw new Error('bad web manifest');

    const done = join(this.o.root, target.version);
    const pointer: WebPointer = { version: target.version, shell: target.shell, booted: false, tries: 0 };
    if (existsSync(join(done, this.o.entry)) && this.pointers.read('active')?.version !== target.version) {
      // already assembled by an earlier run that stopped before it was put in use
      this.pointers.write('pending', pointer);
      onProgress(100);
      return target.version;
    }
    await this.tidying;
    const from = this.loaded?.dir ?? this.o.builtinDir;
    const plan = planWeb(target, await hashWeb(from));
    const part = join(this.o.root, `${target.version}.part`);
    await rm(part, { recursive: true, force: true });
    await mkdir(part, { recursive: true });
    for (const c of plan.copy) await putFile(part, c.path, await readFile(join(from, ...c.from.split('/'))));

    let got = 0;
    const fetched = new Map<string, Uint8Array>();
    const queue = [...plan.download];
    onProgress(plan.bytes ? 0 : 100);
    const worker = async (): Promise<void> => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        let data = fetched.get(f.sha256);
        if (!data) {
          const r = await fetchWithTimeout(this.o.fetch, fileUrl(this.o.channelUrl, f.sha256), this.o.fetchTimeoutMs);
          if (!r.ok) throw new Error(`${f.path}: ${r.status}`);
          data = new Uint8Array(await r.arrayBuffer());
          if (sha256(data) !== f.sha256) throw new Error(`${f.path}: checksum`);
          fetched.set(f.sha256, data);
          got += f.size;
          onProgress(Math.min(99, Math.round((got / Math.max(1, plan.bytes)) * 100)));
        }
        await putFile(part, f.path, data);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, this.o.parallel) }, worker));

    await rm(done, { recursive: true, force: true });
    await rename(part, done);
    this.pointers.write('pending', pointer);
    onProgress(100);
    return target.version;
  }

  /**
   * Puts the pending web in use now and returns the page to load (reload every window from it), or null when there is
   * none this shell may load. The switch counts as its first start, so a web that never boots is still dropped.
   */
  applyPending(): string | null {
    const pending = this.pointers.read('pending');
    if (!this.usable(pending)) return null;
    this.promote(pending, 1);
    this.pointers.write('pending', null);
    this.loaded = { dir: join(this.o.root, pending.version), version: pending.version };
    return join(this.loaded.dir, this.o.entry);
  }

  /** Makes `p` the active web, keeping the one it replaces as the fallback when that one ever booted. */
  private promote(p: WebPointer, tries: number): void {
    const active = this.pointers.read('active');
    if (this.o.keepPrevious && active?.booted && active.version !== p.version) this.pointers.write('previous', active);
    this.pointers.write('active', { ...p, booted: false, tries });
  }

  /** A pointer this shell may load: its own shell, newer than the installed build, its folder whole. */
  private usable(p: WebPointer | null): p is WebPointer {
    return !!p && p.shell === this.shell && isNewer(p.version, this.o.appVersion) && existsSync(join(this.o.root, p.version, this.o.entry));
  }

  /** Removes every patched web but the active, pending and previous one, and any half-made folder. A call made while
   * one is running waits for it and then runs once more, so two never delete the same folder at once. */
  tidy(): Promise<void> {
    const next = this.tidyChain.then(() => this.tidyOnce());
    this.tidyChain = next;
    return next;
  }

  private async tidyOnce(): Promise<void> {
    try {
      const names = ['active', 'pending', 'previous'] as const;
      const keep = new Set([...names.map((n) => this.pointers.read(n)?.version), this.loaded?.version].filter((v): v is string => !!v));
      for (const name of await readdir(this.o.root)) {
        if (name.endsWith('.json') || keep.has(name)) continue;
        await rm(join(this.o.root, name), { recursive: true, force: true });
      }
    } catch {
      // no web folder yet
    }
  }
}
