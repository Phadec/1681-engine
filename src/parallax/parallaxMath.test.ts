import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parallaxOrigin, placeAxis, spanVisible, wrap, type AxisInput, type AxisPlacement } from './parallaxMath';

const out = (): AxisPlacement => ({ position: 0, size: 0, phase: 0, visible: false });
const input = (over: Partial<AxisInput>): AxisInput => ({
  scroll: 0,
  view: 320,
  factor: 0.5,
  offset: 0,
  repeat: false,
  tile: 0,
  contentStart: 0,
  contentSize: 0,
  snap: false,
  ...over,
});

test('a layer moves on screen by its factor of the camera travel', () => {
  for (const factor of [0, 0.25, 0.5, 1, 1.5]) {
    const scroll = 400;
    // on screen (before zoom), a point of the layer stands at origin - scroll
    const before = parallaxOrigin(0, factor) - 0;
    const after = parallaxOrigin(scroll, factor) - scroll;
    assert.equal(before - after, scroll * factor);
  }
  assert.equal(parallaxOrigin(100, 0.5, 30), 80);
});

test('wrap brings any value into one tile, negatives included', () => {
  assert.equal(wrap(5, 16), 5);
  assert.equal(wrap(21, 16), 5);
  assert.equal(wrap(-3, 16), 13);
  assert.equal(wrap(-32, 16), 0);
  assert.equal(wrap(7, 0), 0);
});

test('spanVisible: overlap with the view, edges excluded', () => {
  assert.equal(spanVisible(0, 10, 10, 100), false);
  assert.equal(spanVisible(0, 11, 10, 100), true);
  assert.equal(spanVisible(110, 5, 10, 100), false);
  assert.equal(spanVisible(109, 5, 10, 100), true);
  assert.equal(spanVisible(112, 5, 10, 100, 4), true);
});

test('a repeated axis is a strip over the view whose tiles stand where the parallax puts them', () => {
  const tile = 64;
  for (const scroll of [0, 37, 500, -90]) {
    const p = placeAxis(out(), input({ scroll, view: 320, repeat: true, tile, factor: 0.25, offset: 10 }));
    assert.equal(p.position, scroll);
    assert.ok(p.size >= 320);
    // a tile edge lies at position + phase (+ k tiles), and so does the parallax origin
    const origin = parallaxOrigin(scroll, 0.25, 10);
    const k = (p.position + p.phase - origin) / tile;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-9, `scroll ${scroll}: a tile edge on the origin`);
    assert.ok(p.phase >= 0 && p.phase < tile);
  }
});

test('snapping lands the strip, the phase and an unrepeated layer on whole pixels', () => {
  const r = placeAxis(out(), input({ scroll: 103.6, repeat: true, tile: 32, factor: 0.3, snap: true }));
  assert.equal(r.position, 103);
  assert.ok(Number.isInteger(r.phase));
  const n = placeAxis(out(), input({ scroll: 103.6, factor: 0.34, contentSize: 50, snap: true }));
  assert.equal(n.position, Math.round(103.6 * 0.66));
});

test('an axis that does not repeat is culled once its content leaves the view', () => {
  // content 100 px wide at the layer's origin; factor 1: it scrolls with the world
  const at = (scroll: number) => placeAxis(out(), input({ scroll, view: 200, factor: 1, offset: 500, contentSize: 100 })).visible;
  assert.equal(at(0), false);
  assert.equal(at(350), true);
  assert.equal(at(599), true);
  assert.equal(at(600), false);
  // a zoomed-in camera shows less of the world: the caller passes width / zoom as the view
  assert.equal(placeAxis(out(), input({ scroll: 350, view: 100, factor: 1, offset: 500, contentSize: 100 })).visible, false);
});
