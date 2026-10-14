import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { engineSettings } from '../settings.ts';
import { carriedLight, clearLights, flashLight, lightRadius, liveLights } from './lights.ts';

afterEach(() => {
  clearLights();
  engineSettings.reset();
});

test('a flash shrinks to nothing over its time and is dropped when spent', () => {
  flashLight(5, 6, 40, 100, 0xff8000, 1000);
  const [l] = liveLights(1000);
  assert.equal(lightRadius(l!, 1000), 40);
  assert.ok(Math.abs(lightRadius(l!, 1075) - 20) < 1e-9);
  assert.equal(lightRadius(l!, 1100), 0);
  assert.equal(liveLights(1100).length, 0);
});

test('a carried light follows its rider at full size until ended', () => {
  const at = { x: 0, y: 0 };
  const light = carriedLight(() => at, 24, undefined, 0);
  at.x = 30;
  const [l] = liveLights(500);
  assert.equal(l!.x, 30);
  assert.equal(lightRadius(l!, 500), 24);
  light.end();
  assert.equal(liveLights(501).length, 0);
});

test('a carried light burns at most 20 s, and one whose rider throws is put out', () => {
  carriedLight(() => ({ x: 0, y: 0 }), 10, undefined, 0);
  assert.equal(liveLights(19_999).length, 1);
  assert.equal(liveLights(20_000).length, 0);
  let alive = true;
  carriedLight(() => {
    if (!alive) throw new Error('gone');
    return { x: 0, y: 0 };
  }, 10, undefined, 0);
  alive = false;
  liveLights(1);
  assert.equal(liveLights(2).length, 0);
});

test('no lights are read while combat lights or the battery saver are off', () => {
  flashLight(0, 0, 10, 1000, undefined, 0);
  engineSettings.set({ combatLights: false });
  assert.equal(liveLights(1).length, 0);
  engineSettings.set({ combatLights: true, batterySaver: true });
  assert.equal(liveLights(1).length, 0);
  engineSettings.set({ batterySaver: false });
  assert.equal(liveLights(1).length, 1, 'the list kept time meanwhile');
});

test('past 48 lights the oldest goes', () => {
  for (let i = 0; i < 50; i++) flashLight(i, 0, 10, 1000, undefined, 0);
  const live = liveLights(1);
  assert.equal(live.length, 48);
  assert.equal(live[0]!.x, 2);
});
