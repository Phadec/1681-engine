import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoryBackend } from './MemoryBackend.ts';
import { SaveStore } from './SaveStore.ts';
import { migrateSave, MigrationError } from './migrateSave.ts';
import { checksum } from './checksum.ts';

let clock = 1000;
const now = () => clock++;

test('a save reads back with its info', async () => {
  const backend = new MemoryBackend();
  const store = new SaveStore({ version: 2, backend, now });
  await store.save('a', { gold: 5, items: ['x'] }, { level: 3 });
  const r = await store.load<{ gold: number }>('a');
  assert.ok(r.ok);
  assert.equal(r.data.gold, 5);
  assert.equal(r.info.version, 2);
  assert.deepEqual(r.info.meta, { level: 3 });
  assert.equal(r.migrated, false);
  const missing = await store.load('b');
  assert.deepEqual(missing, { ok: false, slot: 'b', reason: 'missing' });
});

test('old saves walk the migration chain one version at a time', async () => {
  const backend = new MemoryBackend();
  await new SaveStore({ version: 1, backend, now }).save('a', { coins: 7 });
  const store = new SaveStore({
    version: 3,
    backend,
    now,
    migrations: {
      1: (d) => ({ gold: (d as { coins: number }).coins }),
      2: (d) => ({ ...(d as object), bag: [] }),
    },
  });
  const r = await store.load('a');
  assert.ok(r.ok);
  assert.deepEqual(r.data, { gold: 7, bag: [] });
  assert.equal(r.migrated, true);
  assert.equal(r.info.version, 1);
});

test('a save newer than the build, or with a gap in the chain, is refused', async () => {
  const backend = new MemoryBackend();
  await new SaveStore({ version: 5, backend, now }).save('a', {});
  const r = await new SaveStore({ version: 3, backend, now }).load('a');
  assert.equal(!r.ok && r.reason, 'too-new');
  await new SaveStore({ version: 1, backend, now }).save('b', {});
  const gap = await new SaveStore({ version: 3, backend, now, migrations: { 1: (d) => d } }).load('b');
  assert.equal(!gap.ok && gap.reason, 'no-migration');
  assert.throws(() => migrateSave({}, 1, 2, { 1: () => { throw new Error('boom'); } }), (e: unknown) => e instanceof MigrationError && e.reason === 'migration-failed');
});

test('a damaged slot falls back to the previous good save', async () => {
  const backend = new MemoryBackend();
  const store = new SaveStore({ version: 1, backend, now, prefix: 'g:' });
  await store.save('a', { n: 1 });
  await store.save('a', { n: 2 });
  backend.entries.set('g:a', backend.entries.get('g:a')!.replace('"n":2', '"n":3'));
  const r = await store.load<{ n: number }>('a');
  assert.ok(r.ok);
  assert.equal(r.data.n, 1);
  assert.equal(r.fromBackup, true);
  backend.entries.set('g:a', '{"format":"lantern-save",');
  backend.entries.delete('g:a.bak');
  const bad = await store.load('a');
  assert.equal(!bad.ok && bad.reason, 'corrupt');
});

test('list shows readable slots newest first and skips backups', async () => {
  const backend = new MemoryBackend();
  const store = new SaveStore({ version: 1, backend, now });
  await store.save('one', 1);
  await store.save('two', 2);
  await store.save('one', 3);
  backend.entries.set('save:broken', 'not json');
  const slots = (await store.list()).map((s) => s.slot);
  assert.deepEqual(slots, ['one', 'two']);
  await store.delete('one');
  assert.deepEqual((await store.list()).map((s) => s.slot), ['two']);
  assert.equal(backend.entries.has('save:one.bak'), false);
});

test('writes to a slot land in the order they were asked for', async () => {
  const store = new SaveStore({ version: 1, backend: new MemoryBackend(), now });
  await Promise.all([store.save('a', 1), store.save('a', 2), store.save('a', 3)]);
  const r = await store.load('a');
  assert.ok(r.ok && r.data === 3);
});

test('the checksum is stable and sensitive', () => {
  assert.equal(checksum('abc'), checksum('abc'));
  assert.notEqual(checksum('abc'), checksum('abd'));
  assert.equal(checksum('').length, 8);
});
