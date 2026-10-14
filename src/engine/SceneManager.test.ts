import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Container } from 'pixi.js';
import { Clock } from '../core/Clock.ts';
import { SceneManager } from './SceneManager.ts';
import { Scene } from './Scene.ts';
import type { Engine } from './Engine.ts';

/** A scene that records its hooks and stays off any stage. */
class Probe extends Scene {
  constructor(
    readonly name: string,
    readonly log: string[],
    private readonly enterMs = 0,
  ) {
    super();
  }
  override attach(): void {}
  override detach(): void {
    this.world.clear();
  }
  override async onEnter(): Promise<void> {
    this.log.push(`${this.name}:enter`);
    if (this.enterMs) await new Promise((r) => setTimeout(r, this.enterMs));
    this.log.push(`${this.name}:ready`);
  }
  override onExit(): void {
    this.log.push(`${this.name}:exit`);
  }
  override onPause(): void {
    this.log.push(`${this.name}:pause`);
  }
  override onResume(): void {
    this.log.push(`${this.name}:resume`);
  }
}

function fakeEngine(errors: unknown[] = [], camera = { resets: 0 }): Engine {
  const stage = { cameras: { main: { reset: () => camera.resets++ } } };
  return { stage, loop: { reset() {} }, reportError: (_: string, e: unknown) => errors.push(e) } as unknown as Engine;
}

test('push pauses the scene under it, pop resumes it', async () => {
  const log: string[] = [];
  const m = new SceneManager(fakeEngine());
  const level = new Probe('level', log);
  const menu = new Probe('menu', log);
  await m.replace(level);
  await m.push(menu);
  assert.equal(m.current, menu);
  await m.pop();
  assert.equal(m.current, level);
  assert.deepEqual(log, ['level:enter', 'level:ready', 'level:pause', 'menu:enter', 'menu:ready', 'menu:exit', 'level:resume']);
});

test('replace leaves every scene on the stack', async () => {
  const log: string[] = [];
  const m = new SceneManager(fakeEngine());
  await m.replace(new Probe('a', log));
  await m.push(new Probe('b', log));
  await m.replace(new Probe('c', log));
  assert.deepEqual(m.all.map((s) => (s as Probe).name), ['c']);
  assert.ok(log.indexOf('b:exit') < log.indexOf('a:exit') && log.indexOf('a:exit') < log.indexOf('c:enter'));
});

test('nothing updates while a scene is still entering, and changes queue behind it', async () => {
  const log: string[] = [];
  const m = new SceneManager(fakeEngine());
  const slow = new Probe('slow', log, 20);
  const entering = m.replace(slow);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(m.current, undefined, 'a half-entered scene does not update');
  const next = m.replace(new Probe('next', log));
  await Promise.all([entering, next]);
  assert.deepEqual(log, ['slow:enter', 'slow:ready', 'slow:exit', 'next:enter', 'next:ready']);
});

test('a failed change is reported and does not wedge the changes after it', async () => {
  const errors: unknown[] = [];
  const m = new SceneManager(fakeEngine(errors));
  const log: string[] = [];
  const a = new Probe('a', log);
  await m.replace(a);
  await assert.rejects(m.push(a), /already on the scene stack/);
  await m.push(new Probe('b', log));
  assert.equal((m.current as Probe).name, 'b');
  assert.equal(errors.length, 1);
});

test('replace resets the shared camera; push and pop leave it alone', async () => {
  const camera = { resets: 0 };
  const m = new SceneManager(fakeEngine([], camera));
  await m.replace(new Probe('a', []));
  assert.equal(camera.resets, 1);
  await m.push(new Probe('b', []));
  await m.pop();
  assert.equal(camera.resets, 1);
  await m.replace(new Probe('c', []));
  assert.equal(camera.resets, 2);
});

test('pop flushes the resumed scene\'s input before onResume', async () => {
  const log: string[] = [];
  const m = new SceneManager(fakeEngine());
  const level = new Probe('level', log);
  level.useInput({ flush: () => log.push('level:flush') });
  await m.replace(level);
  await m.push(new Probe('menu', log));
  await m.pop();
  assert.deepEqual(log.slice(-2), ['level:flush', 'level:resume']);
});

/** A scene with the real attach/detach, on a stage of bare containers and a clock. */
class Timed extends Scene {
  fired = 0;
  override onEnter(): void {
    this.delay(100, () => this.fired++);
  }
}

test('a scene\'s timers are cancelled when it leaves', async () => {
  const time = new Clock();
  time.now = 0;
  const stage = { world: new Container(), screen: new Container(), time, cameras: { main: { reset() {} } } };
  const engine = { stage, loop: { reset() {} }, reportError() {} } as unknown as Engine;
  const m = new SceneManager(engine);
  const a = new Timed();
  await m.replace(a);
  time.update(150);
  assert.equal(a.fired, 1, 'fires while the scene runs');
  a.delay(100, () => a.fired++);
  await m.replace(new Timed());
  time.update(400);
  assert.equal(a.fired, 1, 'a timer of a scene that left never fires');
});
