import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Container } from 'pixi.js';
import { Group } from './Group.ts';

function three() {
  const g = new Group();
  const [a, b, c] = [new Container(), new Container(), new Container()];
  g.add([a, b, c]);
  return { g, a, b, c };
}

test('moveAbove and moveBelow put a child next to another', () => {
  const { g, a, b, c } = three();
  g.moveAbove(a, c);
  assert.deepEqual(g.list, [b, c, a]);
  g.moveBelow(a, b);
  assert.deepEqual(g.list, [a, b, c]);
});

test('a child already in place is not taken out and put back, so the structure stays clean', () => {
  const { g, a, b, c } = three();
  let moved = 0;
  const remove = g.removeChild.bind(g);
  g.removeChild = ((...children: Container[]) => {
    moved++;
    return remove(...children);
  }) as typeof g.removeChild;
  g.moveAbove(b, a);
  g.moveBelow(b, c);
  assert.equal(moved, 0);
  assert.deepEqual(g.list, [a, b, c]);
  g.moveAbove(a, c);
  assert.equal(moved, 1);
  assert.deepEqual(g.list, [b, c, a]);
});

test('keepAbove and keepBelow move a child only when it is on the wrong side, so two pieces stop pushing each other', () => {
  const { g, a, b, c } = three();
  let moved = 0;
  const remove = g.removeChild.bind(g);
  g.removeChild = ((...children: Container[]) => {
    moved++;
    return remove(...children);
  }) as typeof g.removeChild;
  // b and c both want to be over a: with moveAbove they would swap every call, with keepAbove neither moves
  for (let i = 0; i < 3; i++) {
    g.keepAbove(b, a);
    g.keepAbove(c, a);
  }
  assert.equal(moved, 0);
  g.keepBelow(c, a);
  assert.equal(moved, 1);
  assert.deepEqual(g.list, [c, a, b]);
  g.keepAbove(c, a);
  assert.deepEqual(g.list, [a, c, b]);
});
