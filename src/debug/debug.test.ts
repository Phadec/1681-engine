import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FrameStats } from './FrameStats.ts';
import { ErrorLog } from './ErrorLog.ts';
import { inspectWorld } from './inspectWorld.ts';
import { World, defineComponent, defineFields } from '../ecs/World.ts';

test('frame stats keep the last frames, oldest first', () => {
  const s = new FrameStats(3);
  for (const ms of [10, 20, 30, 40]) s.push(ms);
  assert.equal(s.count, 3);
  assert.deepEqual([s.at(0), s.at(1), s.at(2)], [20, 30, 40]);
  assert.equal(s.average, 30);
  assert.equal(s.max, 40);
  assert.ok(Math.abs(s.fps - 1000 / 30) < 1e-9);
});

test('a repeating error is one entry with a count, and the log is bounded', () => {
  const log = new ErrorLog(2);
  log.add('update', new Error('a'));
  log.add('update', new Error('a'));
  log.add('tweens', 'b');
  log.add('camera', 'c');
  assert.deepEqual(log.entries.map((e) => `${e.where}:${e.message}:${e.count}`), ['tweens:b:1', 'camera:c:1']);
  const again = new ErrorLog();
  again.add('x', 'y');
  again.add('x', 'y');
  assert.equal(again.entries[0]!.count, 2);
});

test('the inspector lists entities with the named components and previews', () => {
  const world = new World();
  const Name = defineComponent<string>('Name');
  const Pos = defineComponent<{ x: number; y: number }>('Pos');
  const Vel = defineFields('Vel', { x: 'f32', y: 'f32' });
  const a = world.spawn([Name, 'crate'], [Pos, { x: 1, y: 2 }]);
  const b = world.create();
  world.add(b, Vel, { x: 1 });
  world.spawn([Name, 'x'.repeat(100)]);
  const rows = inspectWorld(world, [Name, Pos, Vel], 2, 10);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find((r) => r.entity === a)!.components, ['Name crate', 'Pos {"x":1,"y…']);
  const other = rows.find((r) => r.entity !== a)!;
  assert.ok(other.components[0] === 'Vel' || other.components[0]!.startsWith('Name xxxx'));
});
