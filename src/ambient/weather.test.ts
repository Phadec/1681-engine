import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hash01, weatherAt, type WeatherTable } from './weather';

const MIN = 60_000;
const TABLE: WeatherTable<'rain' | 'fog'> = {
  slotMs: 10 * MIN,
  fadeMs: 30_000,
  places: {
    field: [
      { kind: 'clear', weight: 1 },
      { kind: 'rain', weight: 1, intensity: [0.2, 0.6] },
    ],
    marsh: [
      { kind: 'clear', weight: 1 },
      { kind: 'rain', weight: 1, intensity: [0.9, 1] },
    ],
    alone: [{ kind: 'fog', weight: 1, intensity: [0.5, 0.5] }],
    cave: [],
  },
  skies: {
    lowland: {
      places: ['field', 'marsh', 'cave'],
      entries: [
        { kind: 'clear', weight: 1 },
        { kind: 'rain', weight: 2 },
      ],
    },
  },
};

test('the hash is stable and in [0, 1)', () => {
  assert.equal(hash01('abc'), hash01('abc'));
  assert.notEqual(hash01('abc'), hash01('abd'));
  for (let i = 0; i < 200; i++) {
    const v = hash01(`k${i}`);
    assert.ok(v >= 0 && v < 1);
  }
});

test('the same key, time and table give the same weather', () => {
  for (let t = 0; t < 200 * MIN; t += 7 * MIN) assert.deepEqual(weatherAt('field', t, TABLE), weatherAt('field', t, TABLE));
});

test('places under one sky share its kind but keep their own strength', () => {
  let rainy = 0;
  for (let slot = 0; slot < 100; slot++) {
    const t = slot * TABLE.slotMs + TABLE.slotMs / 2;
    const a = weatherAt('field', t, TABLE);
    const b = weatherAt('marsh', t, TABLE);
    assert.equal(a.kind, b.kind);
    if (a.kind === 'rain') {
      rainy++;
      assert.ok(a.intensity >= 0.2 && a.intensity <= 0.6, `field ${a.intensity}`);
      assert.ok(b.intensity >= 0.9 && b.intensity <= 1, `marsh ${b.intensity}`);
    }
  }
  assert.ok(rainy > 40 && rainy < 90, `rain in ${rainy} of 100 slots`);
});

test('a place with no list has no weather, even inside a sky', () => {
  for (let t = 0; t < 50 * MIN; t += MIN) assert.deepEqual(weatherAt('cave', t, TABLE), { kind: 'clear', intensity: 0 });
  assert.equal(weatherAt('nowhere', 0, TABLE).kind, 'clear');
});

test('a kind that does not change does not fade; a change fades in from 0', () => {
  // `alone` is always fog: never faded
  assert.deepEqual(weatherAt('alone', 5, TABLE), { kind: 'fog', intensity: 0.5 });
  // find a slot where rain starts after clear, and check its first moment is faded to nothing
  for (let slot = 1; slot < 200; slot++) {
    const start = slot * TABLE.slotMs;
    if (weatherAt('field', start - TABLE.slotMs / 2, TABLE).kind !== 'clear') continue;
    const w = weatherAt('field', start, TABLE);
    if (w.kind !== 'rain') continue;
    assert.equal(w.intensity, 0);
    assert.ok(weatherAt('field', start + TABLE.fadeMs / 2, TABLE).intensity > 0);
    return;
  }
  assert.fail('no clear-to-rain change found');
});
