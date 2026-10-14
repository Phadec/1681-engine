import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drainState, setDrainValue, stepDrain } from './barDrain';
import { clampScroll, scrollIntoView, stepFling } from './scroll';

test('a loss leaves a trail that holds, then drains down to the bar', () => {
  const s = drainState(1);
  setDrainValue(s, 0.6, { delayMs: 400 });
  assert.equal(s.value, 0.6);
  assert.equal(s.trail, 1);
  stepDrain(s, 300, { delayMs: 400, rate: 1 });
  assert.equal(s.trail, 1, 'still holding');
  stepDrain(s, 200, { delayMs: 400, rate: 1 });
  assert.ok(Math.abs(s.trail - 0.9) < 1e-9, 'the hold used 100 ms, the drain 100 ms');
  for (let i = 0; i < 100; i++) stepDrain(s, 16, { rate: 1 });
  assert.equal(s.trail, 0.6, 'never below the bar');
});

test('a second blow restarts the hold; a heal pulls the trail up with it', () => {
  const s = drainState(1);
  setDrainValue(s, 0.8);
  stepDrain(s, 350);
  setDrainValue(s, 0.5);
  stepDrain(s, 350);
  assert.equal(s.trail, 1);
  setDrainValue(s, 1);
  assert.equal(s.trail, 1);
  assert.equal(s.value, 1);
  setDrainValue(s, 2);
  assert.equal(s.value, 1, 'held to 0–1');
});

test('scrolling is held between the top and the last window of content', () => {
  assert.equal(clampScroll(-10, 500, 100), 0);
  assert.equal(clampScroll(450, 500, 100), 400);
  assert.equal(clampScroll(50, 80, 100), 0, 'content shorter than the view never scrolls');
});

test('scrollIntoView moves the least that shows the item', () => {
  assert.equal(scrollIntoView(0, 20, 10, 100, 500), 0, 'already shown');
  assert.equal(scrollIntoView(0, 120, 10, 100, 500), 30);
  assert.equal(scrollIntoView(200, 150, 10, 100, 500), 150);
  assert.equal(scrollIntoView(0, 495, 10, 100, 500), 400, 'held to the content');
});

test('a fling slows the same at any frame rate and stops', () => {
  let a = 1000;
  for (let i = 0; i < 4; i++) a = stepFling(a, 1000 / 60);
  const b = stepFling(1000, 4000 / 60);
  assert.ok(Math.abs(a - b) < 1e-6);
  assert.equal(stepFling(7, 16), 0);
});
