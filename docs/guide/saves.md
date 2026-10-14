# Saves

`SaveStore` keeps named save slots with a schema version, a chain of migrations from older versions, a checksum that
catches a damaged slot, and the previous good save kept beside it to fall back on. `Autosaver` saves a slot when the
game says something changed, never more often than an interval.

## Save and load

```ts
import { SaveStore } from '1681-engine';

interface Progress {
  level: number;
  coins: number;
}

const saves = new SaveStore({ version: 1, prefix: 'my-game:' });

await saves.save('slot1', { level: 4, coins: 120 }, { level: 4 }); // data, then a small `meta` summary
const r = await saves.load<Progress>('slot1');
if (r.ok) start(r.data);
else if (r.reason !== 'missing') console.warn(`could not read the save (${r.reason}); starting fresh`);
```

`load` never throws for a bad slot: the result says what went wrong.

| `reason` | Meaning |
|---|---|
| `missing` | no such slot: a first visit |
| `corrupt` | it does not parse or its checksum fails, and neither does the backup |
| `too-new` | written by a later build than this one (a downgrade): refused rather than read wrong |
| `no-migration` | a step in the chain is missing |
| `migration-failed` | a migration threw; `error` has it |

On success, `migrated` says the data was brought forward and `fromBackup` that the slot was damaged and its backup was
read instead. Data must be JSON-safe: plain objects, arrays, strings, finite numbers, booleans, null.

## Migrations

Bump `version` whenever the shape of the data changes, and add one step: `migrations[n]` turns version n into n + 1.
A save three versions old goes through every step written since, so you never write a direct path from each old
version.

```ts
const saves = new SaveStore({
  version: 2,
  prefix: 'platformer:',
  migrations: {
    // version 1 kept only the best time, in seconds; version 2 counts coins and keeps ms
    1: (data) => {
      const v1 = data as { best: number | null };
      return { bestMs: v1.best === null ? null : Math.round(v1.best * 1000), bestCoins: 0, totalCoins: 0, language: 'en' };
    },
  },
});
```

[`examples/platformer/Progress.ts`](/examples#platformer) does exactly this; open the example with `?v1` to write a
version 1 save first and watch the migration run.

## A load screen

`list()` returns every slot that reads, newest first, with its `version`, `savedAt` and the `meta` passed to `save`,
without loading or migrating the data. `delete(slot)` removes a slot and its backup.

```ts
for (const s of await saves.list()) addRow(s.slot, new Date(s.savedAt), (s.meta as { level: number }).level);
```

## Autosave

```ts
import { Autosaver } from '1681-engine';

const auto = new Autosaver(saves, 'slot1', () => game.state, { intervalMs: 30_000, meta: () => ({ level: game.level }) });

auto.request(); // after every pickup, kill, door: a burst becomes one save now and one trailing save later
await auto.flush(); // leaving the level or the page: save now if anything is waiting
auto.dispose();
```

The snapshot function is read when the save happens, not when it was asked for, so the trailing save is never stale.
A failed save goes to `onError` (or the console) and autosaving carries on.

## Where slots live

The default backend is `localStorage` (`WebStorageBackend`), or memory where there is none: a sandboxed frame throws on
merely reading `localStorage`, and the game should still run, forgetting on reload. Keep Web Storage saves to a few
hundred KB; browsers allow about 5 MB a site and a write over that rejects the `save` promise.

`SaveBackend` is four async methods (`read`, `write`, `remove`, `keys`), so IndexedDB, a file through Electron or a
native key–value store plugs in behind the same `SaveStore`:

```ts
const files: SaveBackend = { // `shell`: your native wrapper's file API
  read: (key) => shell.readFile(key),
  write: (key, value) => shell.writeFile(key, value),
  remove: (key) => shell.deleteFile(key),
  keys: (prefix) => shell.listFiles(prefix),
};
const saves = new SaveStore({ version: 3, backend: files });
```

## Pitfalls

- Give every game a `prefix`: two games (or a game and its tools) on one origin otherwise share slots.
- Writes to one slot are queued in order, so an autosave and a manual save never land the wrong way round; you do not
  need to wait for one before starting the next.
- A slot name may not end in `.bak`: that suffix is the backup's.
- The stored envelope carries the tag `'lantern-save'`, from the engine's old name. It stays on purpose: every save a
  player already has carries it, and changing it would read them all as corrupt.

## API

[`SaveStore`](/api/index/classes/SaveStore) · [`SaveStoreOptions`](/api/index/interfaces/SaveStoreOptions) ·
[`LoadResult`](/api/index/type-aliases/LoadResult) · [`Autosaver`](/api/index/classes/Autosaver) ·
[`SaveBackend`](/api/index/interfaces/SaveBackend) · [`WebStorageBackend`](/api/index/classes/WebStorageBackend) ·
[`MemoryBackend`](/api/index/classes/MemoryBackend) · [`migrateSave`](/api/index/functions/migrateSave)
