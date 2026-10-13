import assert from 'node:assert/strict';
import { test } from 'node:test';
import { World, defineComponent, defineFields, entityIndex, system } from './World.ts';

const Position = defineComponent<{ x: number; y: number }>('Position');
const Velocity = defineComponent<{ x: number; y: number }>('Velocity');
const Tag = defineComponent<true>('Tag');

test('a query yields only entities holding every component, with them in order', () => {
  const w = new World();
  const a = w.spawn([Position, { x: 0, y: 0 }], [Velocity, { x: 1, y: 2 }]);
  w.spawn([Position, { x: 5, y: 5 }]);
  const rows = [...w.query(Position, Velocity)];
  assert.equal(rows.length, 1);
  const [e, p, v] = rows[0]!;
  assert.equal(e, a);
  assert.deepEqual(p, { x: 0, y: 0 });
  assert.deepEqual(v, { x: 1, y: 2 });
  assert.equal([...w.query(Tag)].length, 0, 'a component nobody has matches nothing');
});

test('systems run in the order added, each in its own phase', () => {
  const w = new World();
  const order: string[] = [];
  w.addSystem(system('a', 'fixed', () => order.push('a')));
  w.addSystem(system('draw', 'frame', () => order.push('draw')));
  w.addSystem(system('b', 'fixed', () => order.push('b')));
  w.run('fixed', { dt: 1 / 60, now: 0, alpha: 0 });
  w.run('frame', { dt: 1 / 60, now: 0, alpha: 0.5 });
  assert.deepEqual(order, ['a', 'b', 'draw']);
  assert.throws(() => w.addSystem(system('a', 'fixed', () => {})), /already added/);
});

test('movement as a system moves every body by its velocity', () => {
  const w = new World();
  const e = w.spawn([Position, { x: 0, y: 0 }], [Velocity, { x: 60, y: -30 }]);
  w.addSystem(
    system('move', 'fixed', ({ world, dt }) => {
      for (const [, p, v] of world.query(Position, Velocity)) {
        p.x += v.x * dt;
        p.y += v.y * dt;
      }
    }),
  );
  for (let i = 0; i < 60; i++) w.run('fixed', { dt: 1 / 60, now: 0, alpha: 0 });
  const p = w.require(e, Position);
  assert.ok(Math.abs(p.x - 60) < 1e-9 && Math.abs(p.y + 30) < 1e-9);
});

test('an entity destroyed mid-run is gone after the run, never under the query walking it', () => {
  const w = new World();
  const a = w.spawn([Position, { x: 0, y: 0 }]);
  const b = w.spawn([Position, { x: 1, y: 0 }]);
  const seen: number[] = [];
  w.addSystem(
    system('kill', 'fixed', ({ world }) => {
      for (const [e] of world.query(Position)) {
        seen.push(e);
        world.destroy(a);
      }
    }),
  );
  w.run('fixed', { dt: 0, now: 0, alpha: 0 });
  assert.deepEqual(seen.sort(), [a, b].sort());
  assert.equal(w.isAlive(a), false);
  assert.equal(w.has(a, Position), false);
  assert.equal(w.size, 1);
});

test('a throwing system is reported and the others still run', () => {
  const w = new World();
  const ran: string[] = [];
  const errors: string[] = [];
  w.addSystem(system('bad', 'fixed', () => { throw new Error('boom'); }));
  w.addSystem(system('good', 'fixed', () => ran.push('good')));
  w.run('fixed', { dt: 0, now: 0, alpha: 0 }, (s) => errors.push(s.name));
  assert.deepEqual(ran, ['good']);
  assert.deepEqual(errors, ['bad']);
});

test('require names the missing component; add refuses a dead entity', () => {
  const w = new World();
  const e = w.create();
  assert.throws(() => w.require(e, Position), /no Position/);
  w.destroy(e);
  assert.throws(() => w.add(e, Tag, true), /not alive/);
});

test('clear disposes every system', () => {
  const w = new World();
  let disposed = 0;
  w.addSystem({ name: 's', phase: 'frame', run() {}, dispose: () => disposed++ });
  w.spawn([Tag, true]);
  w.clear();
  assert.equal(disposed, 1);
  assert.equal(w.size, 0);
});

test('each walks the same entities as query and allocates no rows', () => {
  const w = new World();
  for (let i = 0; i < 100; i++) w.spawn([Position, { x: i, y: 0 }], ...(i % 2 ? [[Velocity, { x: 1, y: 0 }] as [typeof Velocity, { x: number; y: number }]] : []));
  const viaEach: number[] = [];
  w.each(Position, Velocity, (e, p, v) => {
    p.x += v.x;
    viaEach.push(e);
  });
  const viaQuery = [...w.query(Position, Velocity)].map(([e]) => e);
  assert.deepEqual(viaEach.sort(), viaQuery.sort());
  assert.equal(viaEach.length, 50);
});

test('a destroyed id never matches the entity that reuses its slot', () => {
  const w = new World();
  const old = w.spawn([Tag, true]);
  w.destroy(old);
  const reused = w.spawn([Tag, true]);
  assert.notEqual(reused, old);
  assert.equal(w.isAlive(old), false);
  assert.equal(w.has(old, Tag), false);
  assert.equal(w.get(old, Tag), undefined);
  w.destroy(old); // a stale id destroys nothing
  assert.equal(w.isAlive(reused), true);
});

test('removing components while walking skips nobody and visits nobody twice', () => {
  const w = new World();
  const all = Array.from({ length: 20 }, (_, i) => w.spawn([Position, { x: i, y: 0 }]));
  const seen = new Map<number, number>();
  w.each(Position, (e) => {
    seen.set(e, (seen.get(e) ?? 0) + 1);
    // take the component off this one and a neighbour mid-walk
    w.remove(e, Position);
    w.remove(all[(all.indexOf(e) + 7) % all.length]!, Position);
  });
  assert.equal(seen.size, 20);
  assert.ok([...seen.values()].every((n) => n === 1));
  assert.equal(w.count(Position), 0, 'the removals land once the walk ends');
});

test('a walk broken off early still applies what it deferred', () => {
  const w = new World();
  const a = w.spawn([Position, { x: 0, y: 0 }]);
  w.spawn([Position, { x: 1, y: 0 }]);
  for (const [e] of w.query(Position)) {
    w.destroy(a);
    if (e !== -1) break;
  }
  assert.equal(w.isAlive(a), false);
});

test('field components live in typed columns indexed by slot', () => {
  const w = new World();
  const P = defineFields('P', { x: 'f32', y: 'f32' });
  const V = defineFields('V', { x: 'f32', y: 'f32' });
  const ents = Array.from({ length: 200 }, (_, i) => {
    const e = w.create();
    w.add(e, P, { x: i, y: 0 });
    if (i % 4 === 0) w.add(e, V, { x: 2 });
    return e;
  });
  const p = w.columns(P);
  const v = w.columns(V);
  let moved = 0;
  w.each(P, V, (_e, i, j) => {
    assert.equal(i, j, 'every field component of an entity shares its slot');
    p.x[i]! += v.x[i]!;
    moved++;
  });
  assert.equal(moved, 50);
  assert.equal(w.columns(P).x[entityIndex(ents[4]!)], 6);
  assert.equal(w.columns(P).y[entityIndex(ents[4]!)], 0);
});

test('a reused slot starts its fields at zero, not at the last owner’s values', () => {
  const w = new World();
  const P = defineFields('P', { x: 'f64' });
  const a = w.spawn([P, { x: 99 }]);
  w.destroy(a);
  const b = w.create();
  w.add(b, P);
  assert.equal(w.columns(P).x[entityIndex(b)], 0);
});

test('slots is cached, and rebuilt when an entity joins or leaves', () => {
  const w = new World();
  const P = defineFields('P', { x: 'f32' });
  const V = defineFields('V', { x: 'f32' });
  const a = w.spawn([P, {}], [V, {}]);
  const b = w.spawn([P, {}]);
  const first = w.slots(P, V);
  assert.deepEqual([...first], [entityIndex(a)]);
  assert.equal(w.slots(P, V), first, 'nothing changed: the same view comes back');
  w.add(b, V);
  assert.deepEqual([...w.slots(P, V)].sort(), [entityIndex(a), entityIndex(b)].sort());
  w.remove(a, V);
  assert.deepEqual([...w.slots(P, V)], [entityIndex(b)]);
  w.destroy(b);
  assert.equal(w.slots(P, V).length, 0);
  const c = w.spawn([P, { x: 3 }], [V, { x: 4 }]);
  assert.deepEqual([...w.slots(P, V)], [entityIndex(c)], 'a reused slot is picked up');
});

test('slots of a component nobody has is empty', () => {
  const w = new World();
  const P = defineFields('P', { x: 'f32' });
  assert.equal(w.slots(P).length, 0);
});
