import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timeline } from './Timeline';
import { placeAt } from './timelinePlace';
import { Tweener } from './Tweener';

// Every test steps the timeline by hand (a fake clock): no Pixi, no frame loop, the same times every run.

const linear = { ease: 'Linear' } as const;

/** Steps `tl` by `ms` in frames of `frame` ms. */
function run(tl: Timeline, ms: number, frame = 10): void {
  for (let t = 0; t < ms; t += frame) tl.update(Math.min(frame, ms - t));
}

test('children play one after another by default', () => {
  const a = { x: 0 };
  const tl = new Timeline().to(a, { x: 100 }, { duration: 100, ...linear }).to(a, { x: 0 }, { duration: 100, ...linear });
  assert.equal(tl.duration, 200);
  tl.update(50);
  assert.equal(a.x, 50);
  tl.update(100);
  assert.equal(a.x, 50, 'halfway back down');
  tl.update(50);
  assert.equal(a.x, 0);
  assert.equal(tl.isActive, false);
});

test('the second tween on a property starts where the first ended, read when the playhead reaches it', () => {
  const a = { x: 10 };
  const tl = new Timeline().to(a, { x: 20 }, { duration: 100, ...linear }).to(a, { x: 40 }, { duration: 100, ...linear });
  tl.update(150);
  assert.equal(a.x, 30);
});

test('calls fire once, in order, as the playhead passes them — a call on a frame boundary too', () => {
  const log: string[] = [];
  const tl = new Timeline()
    .call(() => log.push('start'))
    .wait(100)
    .call(() => log.push('middle'))
    .wait(100)
    .call(() => log.push('end'));
  tl.update(100);
  assert.deepEqual(log, ['start', 'middle']);
  tl.update(50);
  tl.update(50);
  assert.deepEqual(log, ['start', 'middle', 'end']);
  tl.update(50);
  assert.deepEqual(log, ['start', 'middle', 'end'], 'nothing fires after completion');
});

test("positions: '<' starts with the last child, '-=' overlaps, labels and label offsets", () => {
  const a = { x: 0, y: 0, z: 0, w: 0 };
  const tl = new Timeline()
    .to(a, { x: 1 }, { duration: 100 })
    .to(a, { y: 1 }, { duration: 50, at: '<' })
    .to(a, { z: 1 }, { duration: 100, at: '-=40' })
    .label('hit', 300)
    .to(a, { w: 1 }, { duration: 10, at: 'hit+=20' });
  assert.equal(tl.duration, 330);
  assert.equal(tl.labelTime('hit'), 300);
  const ctx = { fallback: 160, end: 160, lastStart: 60, lastEnd: 160, labels: new Map([['a', 40]]) };
  assert.equal(placeAt('<', ctx), 60);
  assert.equal(placeAt('>-=10', ctx), 150);
  assert.equal(placeAt('+=200', ctx), 360);
  assert.equal(placeAt('a+=5', ctx), 45);
  assert.equal(placeAt('-=500', ctx), 0, 'never before the start');
  assert.equal(placeAt('250', ctx), 250);
  assert.equal(placeAt('fresh', ctx), 160, 'an unknown label is set at the end');
  assert.equal(ctx.labels.get('fresh'), 160);
});

test('a parallel group starts its children together and what follows waits for the longest', () => {
  const a = { x: 0, y: 0, z: 0 };
  const tl = new Timeline()
    .wait(100)
    .parallel((t) => {
      t.to(a, { x: 1 }, { duration: 50 });
      t.to(a, { y: 1 }, { duration: 200 });
      t.to(a, { z: 1 }, { duration: 10, at: '+=30' });
    })
    .call(() => undefined);
  assert.equal(tl.duration, 300);
  tl.update(140);
  assert.ok(a.x > 0 && a.y > 0 && a.z === 1);
});

test('seek shows any moment without firing calls; seeking back restores the values before', () => {
  const a = { x: 5 };
  let calls = 0;
  const tl = new Timeline({ paused: true })
    .to(a, { x: 10 }, { duration: 100, ...linear })
    .call(() => calls++)
    .label('later')
    .to(a, { x: 30 }, { duration: 100, ...linear });
  tl.seek(150);
  assert.equal(a.x, 20);
  tl.seek(50);
  assert.equal(a.x, 7.5);
  tl.seek(0);
  assert.equal(a.x, 5);
  tl.seek('later');
  assert.equal(a.x, 10);
  assert.equal(calls, 0);
  assert.throws(() => tl.seek('nowhere'));
  assert.equal(tl.isPaused, true);
});

test('reverse plays back to the start, firing calls going back, then completes', async () => {
  const a = { x: 0 };
  const log: string[] = [];
  let completes = 0;
  const tl = new Timeline({ onComplete: () => completes++ })
    .to(a, { x: 100 }, { duration: 100, ...linear })
    .call(() => log.push('turn'))
    .to(a, { x: 200 }, { duration: 100, ...linear });
  tl.update(150);
  assert.equal(a.x, 150);
  tl.reverse();
  tl.update(100);
  assert.equal(a.x, 50);
  assert.deepEqual(log, ['turn', 'turn']);
  tl.update(100);
  assert.equal(a.x, 0);
  assert.equal(completes, 1);
  await tl.finished;
});

test('repeat plays again from the start and calls at 0 fire every play', () => {
  const a = { x: 0 };
  let starts = 0;
  let repeats = 0;
  const tl = new Timeline({ repeat: 2, onRepeat: () => repeats++ })
    .call(() => starts++)
    .to(a, { x: 100 }, { duration: 100, ...linear });
  assert.equal(tl.totalDuration, 300);
  run(tl, 150);
  assert.equal(a.x, 50);
  run(tl, 200);
  assert.equal(a.x, 100);
  assert.equal(starts, 3);
  assert.equal(repeats, 2);
  assert.equal(tl.isActive, false);
});

test('yoyo runs every second play backwards, and a call at the turn fires once per turn', () => {
  const a = { x: 0 };
  let ends = 0;
  const tl = new Timeline({ repeat: 1, yoyo: true, repeatDelay: 20 })
    .to(a, { x: 100 }, { duration: 100, ...linear })
    .call(() => ends++);
  assert.equal(tl.totalDuration, 220);
  tl.update(100);
  assert.equal(a.x, 100);
  assert.equal(ends, 1);
  tl.update(10);
  assert.equal(a.x, 100, 'still in the delay');
  tl.update(40);
  assert.equal(a.x, 70);
  tl.update(70);
  assert.equal(a.x, 0);
  assert.equal(ends, 1, 'the turn played its end point already');
});

test('timeScale speeds a timeline up, and pause holds it', () => {
  const a = { x: 0 };
  const tl = new Timeline({ timeScale: 2 }).to(a, { x: 100 }, { duration: 100, ...linear });
  tl.update(25);
  assert.equal(a.x, 50);
  tl.pause();
  tl.update(100);
  assert.equal(a.x, 50);
  tl.resume();
  tl.update(25);
  assert.equal(a.x, 100);
});

test('a manager drives it at its own timeScale, drops it when done, and takes it back on restart', () => {
  const tweens = new Tweener();
  const a = { x: 0 };
  const tl = tweens.timeline().to(a, { x: 100 }, { duration: 100, ...linear });
  tweens.timeScale = 0.5;
  tweens.update(100);
  assert.equal(a.x, 50);
  tweens.timeScale = 1;
  tweens.update(100);
  assert.equal(a.x, 100);
  const listed = (tweens as unknown as { tweens: unknown[] }).tweens;
  assert.equal(listed.length, 0);
  tl.restart();
  assert.equal(a.x, 0);
  tweens.update(30);
  assert.equal(a.x, 30);
  tweens.clear();
  tweens.update(30);
  assert.equal(a.x, 30, 'cleared with the manager');
  assert.equal(tl.isActive, false);
});

test('a destroyed target is skipped, and a forever timeline whose targets are all gone ends at its next turn', () => {
  const sprite = { alpha: 1, destroyed: false };
  const tl = new Timeline({ repeat: -1, yoyo: true }).to(sprite, { alpha: 0 }, { duration: 100, ...linear });
  tl.update(50);
  sprite.destroyed = true;
  tl.update(30);
  assert.equal(sprite.alpha, 0.5);
  assert.equal(tl.isActive, true);
  tl.update(50);
  assert.equal(tl.isActive, false);
});

test('a nested timeline plays as one child, its calls included', () => {
  const a = { x: 0 };
  const log: string[] = [];
  const inner = new Timeline().call(() => log.push('in')).to(a, { x: 10 }, { duration: 100, ...linear });
  const outer = new Timeline().wait(50).add(inner).call(() => log.push('out'));
  assert.equal(outer.duration, 150);
  outer.update(100);
  assert.equal(a.x, 5);
  outer.update(50);
  assert.equal(a.x, 10);
  assert.deepEqual(log, ['in', 'out']);
  assert.throws(() => new Timeline().add(inner), /one parent/);
});

test('`{ from, to }` starts from the given value', () => {
  const a = { x: 99 };
  const tl = new Timeline().to(a, { x: { from: 0, to: 10 } }, { duration: 100, ...linear });
  tl.update(50);
  assert.equal(a.x, 5);
});
