import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AimGesture, aimPoint, dragSlop, spotReach, spotShare } from './AimGesture';

test('a press that stays inside the slop is a tap', () => {
  const g = new AimGesture({ radius: 100 });
  g.move(6, 5);
  assert.equal(g.aiming, false);
  assert.equal(g.up(), 'tap');
});

test('a drag casts, clamped to the circle', () => {
  const g = new AimGesture({ radius: 100 });
  g.move(300, 0);
  assert.equal(g.aiming, true);
  assert.deepEqual(g.knob, { x: 100, y: 0 });
  assert.deepEqual(g.share, { x: 1, y: 0 });
  assert.equal(g.up(), 'cast');
});

test('a slide as the press lands is not a drag; the same slide later is', () => {
  const early = new AimGesture({ radius: 100 });
  early.move(20, 0, false, 50);
  assert.equal(early.up(), 'tap');
  const late = new AimGesture({ radius: 100 });
  late.move(20, 0, false, 500);
  assert.equal(late.up(), 'cast');
  assert.equal(dragSlop(50), 28);
  assert.equal(dragSlop(50, false), 10);
});

test('the cancel zone cancels; back on the button cancels or taps by option', () => {
  const zone = new AimGesture({ radius: 100 });
  zone.move(80, 0);
  zone.move(80, 0, true);
  assert.equal(zone.cancelling, true);
  assert.equal(zone.up(), 'cancel');
  const back = new AimGesture({ radius: 100, centreCancels: true });
  back.move(80, 0);
  back.move(5, 0);
  assert.equal(back.up(), 'cancel');
  const tap = new AimGesture({ radius: 100, centreCancels: false });
  tap.move(80, 0);
  tap.move(5, 0);
  assert.equal(tap.up(), 'tap');
});

test('a spot skill reaches from the feet to its range; a direction goes its length', () => {
  assert.equal(spotReach(0.2), 0);
  assert.equal(spotReach(1), 1);
  const s = spotShare(30, 40, 100);
  assert.ok(Math.abs(spotReach(Math.hypot(s.x, s.y)) - 0.5) < 1e-9);
  const p = aimPoint({ x: 0, y: 0 }, { kind: 'point', range: 100 }, s, 0);
  assert.ok(Math.abs(p.x - 30) < 1e-9 && Math.abs(p.y - 40) < 1e-9);
  const d = aimPoint({ x: 10, y: 0 }, { kind: 'direction', length: 50, backwards: true }, { x: 0.5, y: 0 }, 0);
  assert.ok(Math.abs(d.x - -40) < 1e-9);
  assert.ok(Math.abs(d.aim - Math.PI) < 1e-9);
  // a knob with no length keeps the last aim
  assert.equal(aimPoint({ x: 0, y: 0 }, { kind: 'direction', length: 10 }, { x: 0, y: 0 }, 1.25).aim, 1.25);
  // snapped to eight ways
  const snapped = aimPoint({ x: 0, y: 0 }, { kind: 'direction', length: 10, snap: Math.PI / 4 }, { x: 1, y: 0.3 }, 0);
  assert.equal(snapped.aim, 0);
});
