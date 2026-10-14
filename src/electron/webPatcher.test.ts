import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import type { LatestJson, WebManifest } from '../updates/index.ts';
import { WebPatcher, type WebPatcherOptions } from './webPatcher.ts';

const CH = 'https://store.example/live';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A store serving `files` (content by path) as version `version`, counting the content downloads. */
function store(version: string, files: Record<string, string>, shell = 'S1') {
  const manifest: WebManifest = { version, shell, minNative: 0, files: Object.entries(files).map(([path, c]) => ({ path, sha256: sha(c), size: c.length })) };
  const latest: LatestJson = { version, web: { manifest: `web/${version}.json`, shell, minNative: 0 } };
  const byHash = new Map(Object.values(files).map((c) => [sha(c), c]));
  const fetched: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
    if (url === `${CH}/latest.json`) return json(latest);
    if (url === `${CH}/web/${version}.json`) return json(manifest);
    const m = /\/files\/([0-9a-f]{64})$/.exec(url);
    if (m && byHash.has(m[1]!)) {
      fetched.push(m[1]!);
      return new Response(byHash.get(m[1]!)!, { status: 200 });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;
  return { latest, manifest, fetched, fetcher };
}

function setup(extra: Partial<WebPatcherOptions> = {}) {
  const base = mkdtempSync(join(tmpdir(), 'webpatch-'));
  dirs.push(base);
  const builtinDir = join(base, 'dist');
  mkdirSync(join(builtinDir, 'assets'), { recursive: true });
  writeFileSync(join(builtinDir, 'index.html'), 'page 1');
  writeFileSync(join(builtinDir, 'assets', 'big.png'), 'art');
  const root = join(base, 'web');
  const make = (o: Partial<WebPatcherOptions> = {}) => new WebPatcher({ root, builtinDir, appVersion: '1.0.0', shell: 'S1', channelUrl: CH, log: () => undefined, ...extra, ...o });
  return { base, builtinDir, root, make };
}

test('a newer web for this shell is built from held files plus only new content, then loaded on the next start', async () => {
  const { root, builtinDir, make } = setup();
  const s = store('1.0.1', { 'index.html': 'page 2', 'assets/renamed.png': 'art' });
  const p = make({ fetch: s.fetcher });
  assert.equal(p.startEntry(), join(builtinDir, 'index.html'));
  const l = (await p.latest())!;
  assert.equal(p.patchable(l), true);
  const seen: number[] = [];
  assert.equal(await p.prepare(l, (n) => seen.push(n)), '1.0.1');
  assert.deepEqual(s.fetched, [sha('page 2')], 'the art is copied from where it lay, under its new name');
  assert.equal(seen.at(-1), 100);
  assert.equal(readFileSync(join(root, '1.0.1', 'assets', 'renamed.png'), 'utf8'), 'art');
  assert.equal(existsSync(join(root, '1.0.1.part')), false);

  const next = make({ fetch: s.fetcher });
  assert.equal(next.startEntry(), join(root, '1.0.1', 'index.html'));
  assert.equal(next.webVersion(), '1.0.1');
  assert.equal(next.patchable(l), false, 'already running it');
});

test('another shell, an older version or a bad hash is never patched in', async () => {
  const { make } = setup();
  const other = store('1.0.1', { 'index.html': 'x' }, 'S2');
  const p = make({ fetch: other.fetcher });
  p.startEntry();
  assert.equal(p.patchable(other.latest), false);
  await assert.rejects(p.prepare(other.latest), /bad web manifest/);
  assert.equal(make().patchable(store('0.9.0', { 'index.html': 'x' }).latest), false);

  const s = store('1.0.2', { 'index.html': 'real' });
  const lying = (async (input: string | URL | Request) => (String(input).includes('/files/') ? new Response('forged', { status: 200 }) : s.fetcher(input))) as typeof fetch;
  const q = make({ fetch: lying });
  q.startEntry();
  await assert.rejects(q.prepare(s.latest), /checksum/);
  assert.equal(q.applyPending(), null, 'nothing half-made is put in use');
});

test('a web that never boots is dropped after maxTries starts, back to the last web that did', async () => {
  const { root, make } = setup();
  const s1 = store('1.0.1', { 'index.html': 'good' });
  const a = make({ fetch: s1.fetcher });
  a.startEntry();
  await a.prepare(s1.latest);
  assert.equal(a.applyPending(), join(root, '1.0.1', 'index.html'));
  a.markBooted();

  const s2 = store('1.0.2', { 'index.html': 'broken' });
  const b = make({ fetch: s2.fetcher });
  assert.equal(b.startEntry(), join(root, '1.0.1', 'index.html'));
  await b.prepare(s2.latest);
  // two starts of 1.0.2, neither reporting booted
  assert.equal(make().startEntry(), join(root, '1.0.2', 'index.html'));
  assert.equal(make().startEntry(), join(root, '1.0.2', 'index.html'));
  const c = make();
  assert.equal(c.startEntry(), join(root, '1.0.1', 'index.html'), 'the previous web, not the built-in one');
  assert.equal(c.webVersion(), '1.0.1');
  assert.equal(make().startEntry(), join(root, '1.0.1', 'index.html'), 'and it stays');

  const noKeep = setup({ keepPrevious: false });
  const d = noKeep.make({ fetch: s2.fetcher });
  d.startEntry();
  await d.prepare(s2.latest);
  noKeep.make().startEntry();
  noKeep.make().startEntry();
  assert.equal(noKeep.make().startEntry(), join(noKeep.builtinDir, 'index.html'));
});

test('an installed build as new as the patched web, or a dev run, loads the built-in web', async () => {
  const { builtinDir, make } = setup();
  const s = store('1.0.1', { 'index.html': 'p' });
  const a = make({ fetch: s.fetcher });
  a.startEntry();
  await a.prepare(s.latest);
  assert.equal(make({ appVersion: '1.0.1' }).startEntry(), join(builtinDir, 'index.html'), 'overtaken by an installer');
  assert.equal(make({ packaged: false }).startEntry(), join(builtinDir, 'index.html'));
});

test('tidy keeps only the webs a pointer names', async () => {
  const { root, make } = setup();
  mkdirSync(join(root, '0.9.9'), { recursive: true });
  mkdirSync(join(root, '1.0.5.part'), { recursive: true });
  const p = make();
  p.startEntry();
  await p.tidy();
  assert.equal(existsSync(join(root, '0.9.9')), false);
  assert.equal(existsSync(join(root, '1.0.5.part')), false);
});
