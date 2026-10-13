/*
 * ECS benchmark: the per-step work a game's fixed systems do — walk every moving body and add its velocity — at
 * several sizes, plus spawning and destroying. Run: `npm run bench`.
 *
 * Numbers are the median of several timed rounds after a warm-up, in microseconds per step; `alloc` is the heap the
 * timed rounds grew by (what the GC will have to collect).
 */
import { World, defineComponent, defineFields, system } from '../src/ecs/World.ts';

const Position = defineComponent<{ x: number; y: number }>('Position');
const Velocity = defineComponent<{ x: number; y: number }>('Velocity');
const Sleepy = defineComponent<true>('Sleepy');

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function bench(name: string, setup: () => () => void, steps = 200, rounds = 7): void {
  const run = setup();
  for (let i = 0; i < steps; i++) run(); // warm-up: let the JIT settle
  globalThis.gc?.();
  const heap0 = process.memoryUsage().heapUsed;
  const times: number[] = [];
  for (let r = 0; r < rounds; r++) {
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) run();
    times.push(((performance.now() - t0) * 1000) / steps);
  }
  const alloc = (process.memoryUsage().heapUsed - heap0) / (rounds * steps);
  console.log(`${name.padEnd(44)} ${median(times).toFixed(1).padStart(9)} µs/step   alloc ${(alloc / 1024).toFixed(1).padStart(7)} KB/step`);
}

function movingWorld(n: number, sleepyShare: number): World {
  const w = new World();
  for (let i = 0; i < n; i++) {
    const e = w.spawn([Position, { x: i, y: i }], [Velocity, { x: 1, y: 0.5 }]);
    if (i % Math.round(1 / sleepyShare) === 0) w.add(e, Sleepy, true);
  }
  return w;
}

for (const n of [1_000, 10_000, 50_000]) {
  bench(`query(Position, Velocity) × ${n}`, () => {
    const w = movingWorld(n, 0.1);
    w.addSystem(
      system('move', 'fixed', ({ world, dt }) => {
        for (const [, p, v] of world.query(Position, Velocity)) {
          p.x += v.x * dt;
          p.y += v.y * dt;
        }
      }),
    );
    return () => w.run('fixed', { dt: 1 / 60, now: 0, alpha: 0 });
  });
}

for (const n of [10_000, 50_000]) {
  bench(`each(Position, Velocity) × ${n}`, () => {
    const w = movingWorld(n, 0.1);
    w.addSystem(
      system('move', 'fixed', ({ world, dt }) => {
        world.each(Position, Velocity, (_e, p, v) => {
          p.x += v.x * dt;
          p.y += v.y * dt;
        });
      }),
    );
    return () => w.run('fixed', { dt: 1 / 60, now: 0, alpha: 0 });
  });
}

bench('query(Sleepy, Position) × 50000 (10% match)', () => {
  const w = movingWorld(50_000, 0.1);
  let sum = 0;
  return () => {
    for (const [, , p] of w.query(Sleepy, Position)) sum += p.x;
  };
});

bench('spawn + destroy 1000 bodies', () => {
  const w = new World();
  return () => {
    const made: number[] = [];
    for (let i = 0; i < 1000; i++) made.push(w.spawn([Position, { x: 0, y: 0 }], [Velocity, { x: 1, y: 1 }]));
    for (const e of made) w.destroy(e);
  };
}, 50);

const FPos = defineFields('FPos', { x: 'f32', y: 'f32' });
const FVel = defineFields('FVel', { x: 'f32', y: 'f32' });

for (const n of [10_000, 50_000, 200_000]) {
  bench(`each(fields Position, Velocity) × ${n}`, () => {
    const w = new World();
    for (let i = 0; i < n; i++) w.spawn([FPos, { x: i, y: i }], [FVel, { x: 1, y: 0.5 }]);
    w.addSystem(
      system('move', 'fixed', ({ world, dt }) => {
        const p = world.columns(FPos);
        const v = world.columns(FVel);
        world.each(FPos, FVel, (_e, i) => {
          p.x[i]! += v.x[i]! * dt;
          p.y[i]! += v.y[i]! * dt;
        });
      }),
    );
    return () => w.run('fixed', { dt: 1 / 60, now: 0, alpha: 0 });
  });
}

for (const n of [10_000, 50_000, 200_000]) {
  bench(`slots(fields Position, Velocity) × ${n}`, () => {
    const w = new World();
    for (let i = 0; i < n; i++) w.spawn([FPos, { x: i, y: i }], [FVel, { x: 1, y: 0.5 }]);
    w.addSystem(
      system('move', 'fixed', ({ world, dt }) => {
        const p = world.columns(FPos);
        const v = world.columns(FVel);
        const slots = world.slots(FPos, FVel);
        for (let k = 0; k < slots.length; k++) {
          const i = slots[k]!;
          p.x[i]! += v.x[i]! * dt;
          p.y[i]! += v.y[i]! * dt;
        }
      }),
    );
    return () => w.run('fixed', { dt: 1 / 60, now: 0, alpha: 0 });
  });
}
