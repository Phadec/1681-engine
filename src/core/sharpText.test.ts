import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Container } from 'pixi.js';
import { SharpText } from './SharpText.ts';

function world() {
  const w = new Container({ sortableChildren: true });
  const body = new Container();
  body.position.set(40, 60);
  body.zIndex = 60;
  w.addChild(body);
  return { w, body };
}

test('a label put in a body follows the body on the sharp layer, keeping its own offset', () => {
  const { w, body } = world();
  const sharp = new SharpText(w);
  const name = new Container();
  name.position.set(0, -20);
  body.addChild(name);
  sharp.track(name);
  sharp.sync({ x: -10, y: -5 }, 2);
  const stand = name.parent!;
  assert.equal(stand.parent, sharp.layer);
  assert.equal(stand.x, 40);
  assert.equal(stand.y, 60);
  assert.equal(stand.zIndex, 60);
  assert.equal(name.y, -20);
  body.position.set(50, 70);
  sharp.sync({ x: 0, y: 0 }, 2);
  assert.equal(stand.x, 50);
  body.visible = false;
  sharp.sync({ x: 0, y: 0 }, 2);
  assert.equal(stand.visible, false);
  assert.equal(sharp.layer.scale.x, 2);
});

test('text laid on the world keeps its own depth', () => {
  const { w } = world();
  const sharp = new SharpText(w);
  const pop = new Container();
  pop.zIndex = 1000;
  w.addChild(pop);
  sharp.track(pop);
  sharp.sync({ x: 0, y: 0 }, 1);
  assert.equal(pop.parent!.zIndex, 1000);
});

test('a destroyed container takes its label, and release puts the rest back', () => {
  const { w, body } = world();
  const sharp = new SharpText(w);
  const gone = new Container();
  const kept = new Container();
  body.addChild(gone);
  w.addChild(kept);
  sharp.track(gone);
  sharp.track(kept);
  sharp.sync({ x: 0, y: 0 }, 1);
  body.destroy();
  sharp.sync({ x: 0, y: 0 }, 1);
  assert.ok(gone.destroyed);
  sharp.release();
  assert.equal(kept.parent, w);
  assert.equal(sharp.layer.children.length, 0);
});
