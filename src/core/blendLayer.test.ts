import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blendLayer } from './blendLayer';
import type { Stage } from './Stage';

function fakeStage(): { stage: Stage; made: () => number } {
  let made = 0;
  const stage = {
    add: {
      container: () => {
        made++;
        const g = { depth: 0, blendMode: 'normal', destroyed: false, setDepth(d: number) { g.depth = d; return g; } };
        return g;
      },
    },
  };
  return { stage: stage as unknown as Stage, made: () => made };
}

test('one layer per stage and name, additive and over the bodies by default, made again once destroyed', () => {
  const { stage, made } = fakeStage();
  const a = blendLayer(stage);
  assert.equal(blendLayer(stage), a);
  assert.equal(made(), 1);
  assert.equal(a.blendMode, 'add');
  assert.equal(a.depth, 999_000);
  const other = blendLayer(stage, { name: 'shadow', blend: 'multiply', depth: 5 });
  assert.notEqual(other, a);
  assert.equal(other.blendMode, 'multiply');
  assert.equal(blendLayer(stage, { depth: 7 }).depth, 7);
  (a as { destroyed: boolean }).destroyed = true;
  assert.notEqual(blendLayer(stage), a);
  assert.equal(made(), 3);
});
