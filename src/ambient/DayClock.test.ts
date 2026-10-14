import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DayClock, clockText, mixRgb, tintNight } from './DayClock';

const HOUR = 3600_000;
const clock = new DayClock({
  periodMs: 24 * HOUR,
  keys: [
    { at: 0, color: 0x000040, alpha: 0.5 },
    { at: 0.25, color: 0xffffff, alpha: 0 },
    { at: 0.75, color: 0xffffff, alpha: 0 },
    { at: 1, color: 0x000040, alpha: 0.5 },
  ],
  phases: [
    { id: 'day', from: 0.25 },
    { id: 'night', from: 0.75 },
  ],
});

test('the phase follows the wall clock, wraps, and the offset moves it', () => {
  assert.equal(clock.phaseAt(0), 0);
  assert.equal(clock.phaseAt(12 * HOUR), 0.5);
  assert.equal(clock.phaseAt(36 * HOUR), 0.5);
  assert.equal(clock.phaseAt(-6 * HOUR), 0.75);
  const shifted = new DayClock({ periodMs: 24 * HOUR, offsetMs: 6 * HOUR, keys: [{ at: 0, color: 0, alpha: 0 }] });
  assert.equal(shifted.phaseAt(0), 0.25);
});

test('keys are mixed, night is the share of the darkest key, and night runs through midnight', () => {
  const noon = clock.at(12 * HOUR);
  assert.equal(noon.id, 'day');
  assert.equal(noon.alpha, 0);
  assert.equal(noon.night, 0);
  const midnight = clock.at(0);
  assert.equal(midnight.id, 'night');
  assert.equal(midnight.night, 1);
  const dawnish = clock.at(3 * HOUR); // half way from the first key to the second
  assert.equal(dawnish.alpha, 0.25);
  assert.equal(dawnish.night, 0.5);
  assert.equal(dawnish.color, mixRgb(0x000040, 0xffffff, 0.5));
});

test('a held phase ignores the clock until let go', () => {
  const c = new DayClock({ periodMs: 1000, keys: [{ at: 0, color: 0, alpha: 1 }] });
  c.hold(1.5);
  assert.equal(c.phaseAt(123), 0.5);
  c.hold(null);
  assert.equal(c.phaseAt(250), 0.25);
});

test('clock text and night tint', () => {
  assert.equal(clockText(0), '00:00');
  assert.equal(clockText(0.5), '12:00');
  assert.equal(clockText(0.75 + 1 / 1440), '18:01');
  assert.equal(tintNight({ color: 0x102030, night: 0 }, 0xff0000), 0x102030);
  assert.equal(tintNight({ color: 0x000000, night: 1 }, 0xff0000, 1), 0xff0000);
  assert.equal(tintNight({ color: 0x102030, night: 1 }, undefined), 0x102030);
});
