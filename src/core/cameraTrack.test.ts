import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Container } from 'pixi.js';
import { Camera } from './Camera.ts';

function camera(): Camera {
  const c = new Camera(new Container(), new Container());
  c.width = 320;
  c.height = 180;
  return c;
}

const centre = (c: Camera) => ({ x: c.scrollX + c.width / c.zoom / 2, y: c.scrollY + c.height / c.zoom / 2 });

test('a locked camera keeps the target in the middle', () => {
  const c = camera();
  const hero = { x: 500, y: 300 };
  c.track(hero);
  hero.x = 600;
  c.apply(16);
  assert.deepEqual(centre(c), { x: 600, y: 300 });
});

test('a soft follow closes the same share in the same time at any frame rate', () => {
  const run = (fps: number) => {
    const c = camera();
    const hero = { x: 160, y: 90 };
    c.track(hero, { lerp: 0.1 });
    hero.x = 1160;
    for (let t = 0; t <= 500; t += 1000 / fps) c.apply(t);
    return centre(c).x;
  };
  const at60 = run(60);
  const at144 = run(144);
  assert.ok(at60 > 160 && at60 < 1160, 'it moves, but not all the way at once');
  assert.ok(Math.abs(at60 - at144) < 15, `60 fps reached ${at60}, 144 fps ${at144}`);
});

test('inside the deadzone the camera holds still', () => {
  const c = camera();
  const hero = { x: 160, y: 90 };
  c.track(hero, { deadzoneWidth: 40, deadzoneHeight: 20 });
  hero.x = 175;
  c.apply(16);
  assert.equal(centre(c).x, 160);
  hero.x = 200;
  c.apply(32);
  assert.equal(centre(c).x, 180, 'it moves only by what left the box');
});

test('the bounds still hold while tracking', () => {
  const c = camera();
  c.setBounds(0, 0, 640, 360);
  const hero = { x: 10, y: 10 };
  c.track(hero);
  c.apply(16);
  assert.equal(c.scrollX, 0);
  assert.equal(c.scrollY, 0);
});

test('reset forgets the target and bounds and goes back to the default zoom', () => {
  const c = camera();
  c.defaultZoom = 3;
  const hero = { x: 500, y: 300 };
  c.setBounds(0, 0, 1000, 600).setZoom(2).track(hero);
  c.shake(500, 0.1);
  c.reset();
  assert.equal(c.tracking, null);
  assert.equal(c.boundsRect, null);
  assert.equal(c.zoom, 3);
  assert.deepEqual([c.scrollX, c.scrollY], [0, 0]);
  hero.x = 900;
  c.apply(16);
  assert.deepEqual([c.scrollX, c.scrollY], [0, 0], 'the old target no longer moves the view');
});

test('clearBounds lets the view leave the old bounds', () => {
  const c = camera();
  c.setBounds(0, 0, 400, 400).setScroll(-50, -50);
  assert.deepEqual([c.scrollX, c.scrollY], [0, 0]);
  c.clearBounds().setScroll(-50, -50);
  assert.deepEqual([c.scrollX, c.scrollY], [-50, -50]);
});
