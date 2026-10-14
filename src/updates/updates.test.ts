import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apkUpdateOf, heldBundle, isNewer, pickWebUpdate, planWeb, pluginEntries, safePath, validManifest, type LatestJson, type WebManifest } from './index.ts';

const CH = 'https://store.example/public/test';
const SHA = 'a'.repeat(64);
const h = (c: string) => c.repeat(64);
const latest = (version: string, minNative = 508): LatestJson => ({
  version,
  web: { manifest: `web/${version}.json`, shell: 'abc', minNative },
  apk: { file: `Game-${version}.apk`, size: 1, sha256: SHA },
});
const manifest = (files: [string, string, number][]): WebManifest => ({
  version: '0.5.23',
  shell: 's',
  minNative: 508,
  files: files.map(([path, sha, size]) => ({ path, sha256: h(sha), size })),
});

test('versions compare number by number', () => {
  assert.equal(isNewer('0.5.10', '0.5.9'), true);
  assert.equal(isNewer('v0.5.8', '0.5.8'), false);
  assert.equal(isNewer('0.5.7', '0.5.8'), false);
  assert.equal(isNewer('0.6', '0.5.99'), true);
  assert.equal(isNewer('1.0.0', '1'), false, 'a missing part counts 0');
});

test('a file held at its path or anywhere else is copied; only new content downloads, once', () => {
  const have = new Map([
    ['index.html', h('a')],
    ['assets/old.js', h('b')],
    ['art/x.png', h('c')],
  ]);
  const plan = planWeb(manifest([['index.html', 'a', 10], ['assets/new.js', 'b', 20], ['art/y.png', 'd', 30], ['art/z.png', 'd', 30], ['art/w.png', 'e', 5]]), have);
  assert.deepEqual(plan.copy, [
    { path: 'index.html', from: 'index.html' },
    { path: 'assets/new.js', from: 'assets/old.js' },
  ]);
  assert.deepEqual(plan.download.map((f) => f.path), ['art/y.png', 'art/z.png', 'art/w.png']);
  assert.equal(plan.bytes, 35, 'content shared by two paths is fetched once');
  assert.deepEqual(planWeb(manifest([['index.html', 'a', 1]]), new Map()).bytes, 1);
});

test('a manifest is trusted only whole: safe paths once each, real hashes, an index.html', () => {
  assert.equal(validManifest(manifest([['index.html', 'a', 1]])), true);
  assert.equal(validManifest(manifest([['a.js', 'a', 1]])), false);
  assert.equal(validManifest(manifest([['index.html', 'a', 1], ['../evil', 'b', 1]])), false);
  assert.equal(validManifest(manifest([['index.html', 'a', 1], ['index.html', 'b', 1]])), false);
  assert.equal(validManifest({ ...manifest([['index.html', 'a', 1]]), files: [{ path: 'index.html', sha256: 'zz', size: 1 }] }), false);
  assert.equal(validManifest({ ...manifest([['index.html', 'a', 1]]), files: [{ path: 'index.html', sha256: SHA.toUpperCase(), size: 1 }] }), false);
  assert.equal(validManifest(null), false);
  assert.equal(safePath('C:\\x'), false);
  assert.equal(safePath('a/./b'), false);
  assert.equal(safePath('a\0b'), false);
  assert.equal(safePath('assets/x.png'), true);
  assert.equal(safePath('/etc/x'), false);
  assert.equal(safePath('a//b'), false);
});

test('a web is taken only when newer than the running one and the native shell is new enough', () => {
  assert.deepEqual(pickWebUpdate(latest('0.5.23'), CH, '0.5.22', 508), { version: '0.5.23', manifestUrl: `${CH}/web/0.5.23.json`, minNative: 508 });
  assert.equal(pickWebUpdate(latest('0.5.23'), CH, '0.5.23', 508), null, 'already running it');
  assert.equal(pickWebUpdate(latest('0.5.23'), CH, '0.6.0', 508), null, 'running something newer');
  assert.equal(pickWebUpdate(latest('0.5.23', 509), CH, '0.5.22', 508), null, 'needs native code this app lacks');
  assert.notEqual(pickWebUpdate(latest('0.5.23', 509), CH, '0.5.22', Infinity), null, 'no native layer');
  assert.equal(pickWebUpdate({ version: '0.5.23' }, CH, '0.5.22', 508), null, 'no web in that build');
});

test('the APK is offered only when newer and its web cannot come over the air', () => {
  const l = latest('0.6.0', 600);
  assert.deepEqual(apkUpdateOf(l, CH, '0.5.9', null), { version: '0.6.0', apkUrl: `${CH}/Game-0.6.0.apk` });
  assert.equal(apkUpdateOf(l, CH, '0.6.0', null), null);
  assert.equal(apkUpdateOf(l, CH, '0.5.9', pickWebUpdate(latest('0.6.0'), CH, '0.5.9', 508)), null);
  assert.equal(apkUpdateOf({ version: '0.6.0' }, CH, '0.5.9', null), null);
});

test("the manifest becomes the plugin's list, each file fetched by its hash, or is refused whole", () => {
  const m = { version: '0.5.23', shell: 'x', minNative: 1, files: [{ path: 'index.html', sha256: SHA, size: 3 }, { path: 'assets/a.js', sha256: 'b'.repeat(64), size: 9 }] };
  assert.deepEqual(pluginEntries(m, '0.5.23', CH), [
    { file_name: 'index.html', file_hash: SHA, download_url: `${CH}/files/${SHA}` },
    { file_name: 'assets/a.js', file_hash: 'b'.repeat(64), download_url: `${CH}/files/${'b'.repeat(64)}` },
  ]);
  assert.equal(pluginEntries(m, '0.5.24', CH), null, 'another version');
  assert.equal(pluginEntries({ ...m, files: [...m.files, { path: '../x', sha256: SHA, size: 1 }] }, '0.5.23', CH), null, 'a path out of the folder');
  assert.equal(pluginEntries({ ...m, files: [m.files[1]] }, '0.5.23', CH), null, 'no index.html');
  assert.equal(pluginEntries({ ...m, files: [m.files[0], m.files[0]] }, '0.5.23', CH), null, 'a path twice');
});

test('a web already downloaded whole is taken again, not fetched twice', () => {
  const b = pickWebUpdate(latest('0.6.0'), CH, '0.5.9', 508)!;
  const held = (status: string, version = '0.6.0') => ({ id: 'x', version, status });
  assert.equal(heldBundle([held('pending')], b)?.id, 'x');
  assert.equal(heldBundle([held('success')], b)?.id, 'x');
  assert.equal(heldBundle([held('error')], b), null);
  assert.equal(heldBundle([held('pending', '0.5.9')], b), null);
});
