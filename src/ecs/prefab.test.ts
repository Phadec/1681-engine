import assert from 'node:assert/strict';
import { test } from 'node:test';
import { definePrefab, isPrefabOf, prefabPart, PrefabLibrary, spawnPrefab } from './prefab.ts';
import { defineComponent, defineFields, World } from './World.ts';

const Health = defineComponent<{ hp: number; max: number }>('Health');
const Stats = defineComponent<{ speed: number; tags: string[]; resist: { fire: number; ice: number } }>('Stats');
const Name = defineComponent<string>('Name');
const Flying = defineComponent<boolean>('Flying');
const Pos = defineFields('Pos', { x: 'f32', y: 'f32' });
const Brain = defineComponent<{ id: number }>('Brain');

const Monster = definePrefab('monster', [
  [Health, { hp: 10, max: 10 }],
  [Stats, { speed: 2, tags: ['beast'], resist: { fire: 0, ice: 0 } }],
  [Flying, true],
  [Name, 'monster'],
]);

test('every entity from a prefab gets its own copy of the values', () => {
  const world = new World();
  const a = spawnPrefab(world, Monster);
  const b = spawnPrefab(world, Monster);
  world.require(a, Health).hp = 1;
  world.require(a, Stats).tags.push('hurt');
  assert.equal(world.require(b, Health).hp, 10);
  assert.deepEqual(world.require(b, Stats).tags, ['beast']);
  assert.equal(world.get(b, Name), 'monster');
  assert.equal(world.get(b, Flying), true);
  assert.deepEqual(world.componentsOf(a).map((t) => t.name).sort(), ['Flying', 'Health', 'Name', 'Stats']);
});

test('a variant lays its values over the base field by field, and null takes a component away', () => {
  const Boss = definePrefab('boss', [
    [Health, { hp: 200, max: 200 }],
    [Stats, { resist: { fire: 0.5 } }],
    [Flying, null],
  ], { extends: Monster });
  const world = new World();
  const e = spawnPrefab(world, Boss);
  assert.deepEqual(world.get(e, Health), { hp: 200, max: 200 });
  assert.deepEqual(world.get(e, Stats), { speed: 2, tags: ['beast'], resist: { fire: 0.5, ice: 0 } });
  assert.equal(world.has(e, Flying), false);
  assert.equal(world.get(e, Name), 'monster');
  assert.ok(isPrefabOf(Boss, Monster));
  assert.ok(!isPrefabOf(Monster, Boss));
  // arrays replace rather than merge: a variant's list is its own list
  const Tagged = definePrefab('tagged', [[Stats, { tags: ['undead'] }]], { extends: Monster });
  assert.deepEqual(world.get(spawnPrefab(world, Tagged), Stats)!.tags, ['undead']);
});

test('factories run once per entity with its id and the spawn args; field components take their values', () => {
  let made = 0;
  const Spawned = definePrefab<{ x: number; y: number }>('spawned', [
    prefabPart(Brain, ({ entity }) => ({ id: entity + 1000 + made++ })),
    prefabPart(Pos, ({ args }: { args: { x: number; y: number } }) => ({ x: args.x, y: args.y })),
  ]);
  const world = new World();
  const a = spawnPrefab(world, Spawned, { args: { x: 3, y: 4 } });
  const b = spawnPrefab(world, Spawned, { args: { x: 5, y: 6 } });
  assert.equal(made, 2);
  assert.notEqual(world.get(a, Brain), world.get(b, Brain));
  assert.equal(world.require(a, Brain).id, a + 1000);
  const pos = world.columns(Pos);
  const slot = world.get(b, Pos)!;
  assert.deepEqual([pos.x[slot], pos.y[slot]], [5, 6]);
});

test('a spawn may add, replace and leave out components for that entity only', () => {
  const world = new World();
  const e = spawnPrefab(world, Monster, { with: [[Name, 'Grub'], [Health, { hp: 3 }]], without: [Flying] });
  assert.equal(world.get(e, Name), 'Grub');
  assert.deepEqual(world.get(e, Health), { hp: 3, max: 10 });
  assert.equal(world.has(e, Flying), false);
  const plain = spawnPrefab(world, Monster);
  assert.equal(world.get(plain, Name), 'monster');
  assert.equal(world.has(plain, Flying), true);
});

test('a library loads prefabs from data, bases in any order, with factories from code', () => {
  const lib = new PrefabLibrary().component('Health', Health).component('Stats', Stats).component('Name', Name).component('Flying', Flying);
  let brains = 0;
  lib.factory('goblin', Brain, () => ({ id: brains++ }));
  lib.add(Monster);
  lib.load({
    'goblin-chief': { extends: 'goblin', components: { Health: { hp: 30 }, Name: 'chief' } },
    goblin: { extends: 'monster', components: { Health: { hp: 6, max: 6 }, Flying: null, Name: 'goblin' } },
  });
  const world = new World();
  const chief = lib.spawn(world, 'goblin-chief');
  assert.deepEqual(world.get(chief, Health), { hp: 30, max: 6 });
  assert.equal(world.get(chief, Name), 'chief');
  assert.equal(world.has(chief, Flying), false);
  assert.deepEqual(world.get(chief, Brain), { id: 0 }, 'the base factory is inherited');
  assert.equal(world.get(chief, Stats)!.speed, 2, 'and the code-made base under it');
  assert.ok(isPrefabOf(lib.get('goblin-chief'), Monster));
  assert.deepEqual(lib.names().sort(), ['goblin', 'goblin-chief', 'monster']);
  assert.ok(lib.has('goblin'));
});

test('bad data is refused naming the prefab, and nothing half-loaded is kept', () => {
  const lib = new PrefabLibrary().component('Health', Health);
  assert.throws(() => lib.load({ a: { components: { Mana: 3 } } }), /'a' names an unknown component 'Mana'/);
  assert.throws(() => lib.load({ a: { extends: 'nope' } }), /no prefab 'nope'/);
  assert.throws(() => lib.load({ a: { extends: 'b' }, b: { extends: 'a' } }), /extends itself/);
  assert.throws(() => lib.load({ ok: {}, bad: { components: { X: 1 } } }));
  assert.equal(lib.has('ok'), false);
  assert.throws(() => lib.get('ghost'), /no prefab 'ghost'/);
});
