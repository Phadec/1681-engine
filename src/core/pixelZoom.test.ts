import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseZoom, fitScale, worldZoom, zoomResolution, zoomSteps } from './pixelZoom';

test('baseZoom: phones get 2, 1080p 4, clamped to 2–5', () => {
  assert.equal(baseZoom(375), 2);
  assert.equal(baseZoom(402), 2);
  assert.equal(baseZoom(440), 2);
  assert.equal(baseZoom(720), 2);
  assert.equal(baseZoom(1080), 4);
  assert.equal(baseZoom(5000), 5);
  assert.equal(baseZoom(100), 2);
  assert.equal(baseZoom(600, { pxPerStep: 100, baseMax: 8 }), 6);
});

test('worldZoom: whole steps, the one half step kept, other halves rounded, clamped', () => {
  assert.equal(worldZoom(402), 2);
  assert.equal(worldZoom(402, -0.5), 1.5);
  assert.equal(worldZoom(1080, -2.5), 1.5);
  assert.equal(worldZoom(1080, -1.5), 3, 'a half step that is not ×1.5 rounds');
  assert.equal(worldZoom(402, -5), 1);
  assert.equal(worldZoom(1080, 9), 6);
  assert.equal(worldZoom(402, -0.5, { halfZoom: null }), 2);
});

test('zoomSteps offers whole steps plus the offset landing on ×1.5, once per zoom', () => {
  assert.deepEqual(zoomSteps(402), [
    { offset: -1, zoom: 1 },
    { offset: -0.5, zoom: 1.5 },
    { offset: 0, zoom: 2 },
    { offset: 1, zoom: 3 },
  ]);
  assert.deepEqual(zoomSteps(1080).map((s) => s.zoom), [1.5, 2, 3, 4, 5]);
  assert.deepEqual(zoomSteps(402, [-1, 0], -2.5, { halfZoom: null }), [{ offset: -1, zoom: 1 }, { offset: 0, zoom: 2 }]);
});

test('zoomResolution: 1 when whole or coarse, else the least resolution making a world pixel whole', () => {
  assert.equal(zoomResolution(2, 3), 1);
  assert.equal(zoomResolution(1.5, 1), 1);
  assert.equal(zoomResolution(1.5, 2), 2);
  assert.equal(zoomResolution(2.5, 3), 2);
  assert.equal(zoomResolution(1.25, 3), 4);
  assert.equal(zoomResolution(1.25, 3, 1.5, 2), 1, 'nothing up to the cap makes it whole');
  assert.equal(zoomResolution(1.5, 1.2, 1), 2);
});

test('fitScale: the largest whole scale fitting both ways, never below 1', () => {
  assert.equal(fitScale(100, 50, 350, 400), 3);
  assert.equal(fitScale(100, 50, 50, 50), 1);
  assert.equal(fitScale(0, 50, 50, 50), 1);
});
