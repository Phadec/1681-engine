import assert from 'node:assert/strict';
import { test } from 'node:test';
import { World, defineComponent, system } from './World.ts';

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
  assert.deepEqual(seen, [a, b]);
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
