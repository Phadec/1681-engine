import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Clock } from './Clock';
import { Stage } from './Stage';
import { Tweener } from './Tweener';

// A map's forever tweens (a glow breathing, a "!" bobbing) outlived the map: 156 → 511 tweens over a session, each
// holding a destroyed sprite. And every map's darkness kept a resize listener on the stage for good.

test('a forever tween whose every target is destroyed leaves the list', () => {
  const tweens = new Tweener();
  const sprite = { alpha: 1, destroyed: false };
  tweens.add({ targets: sprite, alpha: 0.5, duration: 100, yoyo: true, repeat: -1 });
  tweens.update(16);
  assert.equal((tweens as unknown as { tweens: unknown[] }).tweens.length, 1);
  sprite.destroyed = true;
  tweens.update(16);
  assert.equal((tweens as unknown as { tweens: unknown[] }).tweens.length, 0);
});

test('a forever tween on a plain object (no `destroyed`) or on one live target among dead ones keeps running', () => {
  const tweens = new Tweener();
  const clock = { t: 0 };
  const dead = { alpha: 1, destroyed: true };
  const live = { alpha: 1, destroyed: false };
  tweens.add({ targets: clock, t: 1, duration: 100, repeat: -1 });
  tweens.add({ targets: [dead, live], alpha: 0, duration: 100, repeat: -1 });
  for (let i = 0; i < 20; i++) tweens.update(16);
  assert.equal((tweens as unknown as { tweens: unknown[] }).tweens.length, 2);
  assert.ok(live.alpha < 1, 'the live target still moves');
  assert.equal(dead.alpha, 1, 'the dead one is never written');
});

test('a finite tween on a destroyed target still runs out and calls onComplete', () => {
  const tweens = new Tweener();
  const sprite = { alpha: 1, destroyed: true };
  let done = 0;
  tweens.add({ targets: sprite, alpha: 0, duration: 50, onComplete: () => done++ });
  for (let i = 0; i < 10; i++) tweens.update(16);
  assert.equal(done, 1);
});

test('a resize listener can be taken off the stage, even from inside a resize', () => {
  class TestStage extends Stage {
    update(): void {}
  }
  const s = Object.create(TestStage.prototype) as Stage & Record<string, unknown>;
  const screen = { width: 800, height: 600 };
  Object.assign(s, {
    app: { screen },
    tweens: new Tweener(),
    time: new Clock(),
    cameras: { main: { width: 0, height: 0, apply: () => undefined } },
    resizeListeners: [],
    lastWidth: 0,
    lastHeight: 0,
    reported: new Set<string>(),
  });
  let a = 0;
  let b = 0;
  const offA = s.onResize(() => {
    a++;
    offA();
  });
  const offB = s.onResize(() => b++);
  s.frame(16);
  assert.deepEqual([a, b], [1, 1], 'both heard the first size, though A left during it');
  screen.width = 1024;
  s.frame(16);
  assert.deepEqual([a, b], [1, 2]);
  offB();
  screen.width = 640;
  s.frame(16);
  assert.deepEqual([a, b], [1, 2]);
  assert.equal((s as unknown as { resizeListeners: unknown[] }).resizeListeners.length, 0);
});
