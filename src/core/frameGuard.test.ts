import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Ticker } from 'pixi.js';
import { Clock } from './Clock';
import { Stage } from './Stage';
import { Tweener } from './Tweener';

// The world froze on an Android phone: a ticker listener that throws never asks for the next
// animation frame, so one bad frame stopped the game for good. These play that and worse.

const quiet = <T>(fn: () => T): T => {
  const error = console.error;
  console.error = () => undefined;
  try {
    return fn();
  } finally {
    console.error = error;
  }
};

/** A Stage with stand-ins for the Pixi pieces, built without its constructor (which needs a canvas). */
function stageWith(update: (now: number) => void) {
  class TestStage extends Stage {
    update(now: number): void {
      update(now);
    }
  }
  const s = Object.create(TestStage.prototype) as Stage & Record<string, unknown>;
  const camera = { applied: 0, width: 0, height: 0, apply: () => void camera.applied++ };
  Object.assign(s, {
    app: { screen: { width: 800, height: 600 } },
    tweens: new Tweener(),
    time: new Clock(),
    cameras: { main: camera },
    resizeListeners: [],
    lastWidth: 0,
    lastHeight: 0,
    reported: new Set<string>(),
  });
  return { stage: s, camera };
}

test('a frame whose update throws every time never throws out of the loop, and the rest of the frame still runs', () => {
  const { stage, camera } = stageWith(() => {
    throw new Error('body gone mid-frame');
  });
  const box = { x: 0 };
  stage.tweens.add({ targets: box, x: 100, duration: 100 });
  let fired = 0;
  stage.time.delayedCall(0, () => fired++);
  const logged: unknown[] = [];
  const error = console.error;
  console.error = (...a: unknown[]) => void logged.push(a);
  try {
    for (let i = 0; i < 60; i++) stage.frame(16);
  } finally {
    console.error = error;
  }
  assert.equal(box.x, 100, 'tweens still move');
  assert.equal(fired, 1, 'timers still fire');
  assert.equal(camera.applied, 60, 'the camera still follows');
  assert.equal(logged.length, 1, 'the same fault is logged once, not 60 times a second');
});

test('a step guarded inside update answers its fallback, the steps after it run, and the fault is told once', () => {
  // something before the camera's follow threw every frame, so the view stood on one spot
  let followed = 0;
  const told: string[] = [];
  const { stage } = stageWith(() => {
    const g = stage as unknown as {
      guard(step: string, fn: () => void): void;
      guarded<T>(step: string, fn: () => T, fallback: T): T;
    };
    g.guard('views', () => {
      throw new Error('a body that cannot be drawn');
    });
    const shot = g.guarded<number | null>('cutscene', () => {
      throw new Error('no stage');
    }, null);
    if (shot === null) followed++;
  });
  const before = Stage.onCaught;
  Stage.onCaught = (where) => void told.push(where);
  try {
    quiet(() => {
      for (let i = 0; i < 30; i++) stage.frame(16);
    });
  } finally {
    Stage.onCaught = before;
  }
  assert.equal(followed, 30, 'the camera follow after the faulty steps ran every frame');
  assert.deepEqual(told, ['[frame] views', '[frame] cutscene'], 'each fault is told once, not every frame');
});

test('a Pixi ticker keeps asking for frames when the world frame throws', () => {
  const { stage } = stageWith(() => {
    throw new Error('bad frame');
  });
  const ticker = new Ticker();
  let rendered = 0;
  ticker.add(() => stage.frame(ticker.deltaMS));
  // Pixi's own render runs after the world's frame on the same ticker
  ticker.add(() => rendered++);
  quiet(() => {
    for (let i = 1; i <= 10; i++) ticker.update(i * 16);
  });
  assert.equal(rendered, 10, 'the render after it ran every frame');
  ticker.destroy();
});

test('every step failing at once (worst case) still leaves the loop alive', () => {
  const { stage } = stageWith(() => {
    throw new Error('update');
  });
  stage.tweens.add({ targets: {}, x: 1, duration: 10, onUpdate: () => { throw new Error('tween'); } });
  stage.time.delayedCall(0, () => { throw new Error('timer'); });
  (stage.cameras.main as unknown as { apply: () => void }).apply = () => { throw new Error('camera'); };
  quiet(() => assert.doesNotThrow(() => { for (let i = 0; i < 30; i++) stage.frame(16); }));
});

test('a tween whose onComplete throws is dropped, and every other tween finishes exactly once', () => {
  const tweens = new Tweener();
  const done: string[] = [];
  tweens.add({ targets: {}, x: 1, duration: 10, onComplete: () => done.push('a') });
  tweens.add({ targets: {}, x: 1, duration: 10, onComplete: () => { throw new Error('destroyed twice'); } });
  tweens.add({ targets: {}, x: 1, duration: 50, onComplete: () => done.push('c') });
  tweens.add({ targets: {}, x: 1, duration: 50, onComplete: () => done.push('d') });
  quiet(() => { for (let i = 0; i < 10; i++) tweens.update(16); });
  assert.deepEqual(done, ['a', 'c', 'd'], 'no tween lost or played twice by a half-compacted list');
});

test('a tween throwing on every step does not hold up the tweens behind it', () => {
  const tweens = new Tweener();
  let errors = 0;
  tweens.add({ targets: {}, x: 1, duration: 1000, onUpdate: () => { errors++; throw new Error('every step'); } });
  const box = { y: 0 };
  tweens.add({ targets: box, y: 10, duration: 100 });
  quiet(() => { for (let i = 0; i < 20; i++) tweens.update(16); });
  assert.equal(errors, 1, 'dropped after its first failure');
  assert.equal(box.y, 10);
});

test('a tween started from a callback in the frame that fails is kept', () => {
  const tweens = new Tweener();
  const box = { z: 0 };
  tweens.add({ targets: {}, x: 1, duration: 10, onComplete: () => tweens.add({ targets: box, z: 5, duration: 20 }) });
  tweens.add({ targets: {}, x: 1, duration: 10, onComplete: () => { throw new Error('boom'); } });
  quiet(() => { for (let i = 0; i < 5; i++) tweens.update(16); });
  assert.equal(box.z, 5);
});

test('one timer throwing does not take the others due with it, nor the later ones', () => {
  const clock = new Clock();
  clock.now = 0;
  const ran: string[] = [];
  clock.delayedCall(10, () => ran.push('a'));
  clock.delayedCall(10, () => { throw new Error('bad'); });
  clock.delayedCall(10, () => ran.push('c'));
  clock.delayedCall(100, () => ran.push('later'));
  quiet(() => {
    clock.update(20);
    clock.update(200);
  });
  assert.deepEqual(ran, ['a', 'c', 'later']);
});
