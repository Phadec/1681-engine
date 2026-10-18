import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Container } from 'pixi.js';
import { deferDepthSort, flushDepthSorts } from './depthSort.ts';

function world() {
  const w = new Container({ sortableChildren: true, isRenderGroup: true });
  const [a, b, c] = [new Container(), new Container(), new Container()];
  a.zIndex = 0;
  b.zIndex = 10;
  c.zIndex = 20;
  w.addChild(a, b, c);
  deferDepthSort(w);
  flushDepthSorts();
  w.renderGroup!.structureDidChange = false;
  return { w, a, b, c };
}

test('a child moving in depth without passing another changes nothing Pixi has to rebuild', () => {
  const { w, a, b } = world();
  a.zIndex = 4;
  b.zIndex = 12;
  assert.equal(w.renderGroup!.structureDidChange, false, 'not marked at the change');
  flushDepthSorts();
  assert.equal(w.renderGroup!.structureDidChange, false, 'still in order: nothing to rebuild');
});

test('a child passing another is sorted into place and the structure marked changed', () => {
  const { w, a, b, c } = world();
  a.zIndex = 15;
  flushDepthSorts();
  assert.deepEqual(w.children, [b, a, c]);
  assert.equal(w.renderGroup!.structureDidChange, true);
});

test('a container not handed over keeps Pixi’s own behaviour', () => {
  const plain = new Container({ sortableChildren: true, isRenderGroup: true });
  const x = new Container();
  plain.addChild(x);
  plain.renderGroup!.structureDidChange = false;
  x.zIndex = 3;
  assert.equal(plain.renderGroup!.structureDidChange, true);
});
