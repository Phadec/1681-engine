import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Autosaver, type AutosaveTimers } from './Autosaver.ts';
import { MemoryBackend } from './MemoryBackend.ts';
import { SaveStore } from './SaveStore.ts';

class FakeTimers implements AutosaveTimers {
  t = 0;
  private due: { at: number; fn: () => void; id: number }[] = [];
  private id = 0;
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = ++this.id;
    this.due.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(h: unknown): void {
    this.due = this.due.filter((d) => d.id !== h);
  }
  advance(ms: number): void {
    this.t += ms;
    const ready = this.due.filter((d) => d.at <= this.t);
    this.due = this.due.filter((d) => d.at > this.t);
    for (const d of ready) d.fn();
  }
}

const tick = () => new Promise((r) => setImmediate(r));

test('a burst of changes is one save now and one trailing save with the newest state', async () => {
  const timers = new FakeTimers();
  const store = new SaveStore({ version: 1, backend: new MemoryBackend() });
  let writes = 0;
  const save = store.save.bind(store);
  store.save = (slot, data, meta) => {
    writes++;
    return save(slot, data, meta);
  };
  let state = 0;
  const auto = new Autosaver(store, 'auto', () => state, { intervalMs: 1000, timers });
  state = 1;
  auto.request();
  await tick();
  for (state = 2; state <= 5; state++) auto.request();
  state = 5;
  await tick();
  assert.equal(writes, 1);
  timers.advance(1000);
  await tick();
  assert.equal(writes, 2);
  const r = await store.load('auto');
  assert.ok(r.ok && r.data === 5);
});

test('flush writes what is waiting, and dispose drops it', async () => {
  const timers = new FakeTimers();
  const store = new SaveStore({ version: 1, backend: new MemoryBackend() });
  let state = 'a';
  const auto = new Autosaver(store, 's', () => state, { intervalMs: 1000, timers });
  auto.request();
  await tick();
  state = 'b';
  auto.request();
  await auto.flush();
  const r = await store.load('s');
  assert.ok(r.ok && r.data === 'b');
  state = 'c';
  auto.request();
  auto.dispose();
  timers.advance(5000);
  await tick();
  const after = await store.load('s');
  assert.ok(after.ok && after.data === 'b');
});
