import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Container } from 'pixi.js';
import type { Stage } from '../core/Stage.ts';
import { ColorGrade } from './ColorGrade.ts';

test('a grade placed at the bottom sits under a HUD made before it and one made after', () => {
  const screen = new Container();
  const stage = { screen, width: 320, height: 180 } as unknown as Stage;
  const early = screen.addChild(new Container());
  const grade = new ColorGrade(stage, () => ({ color: 0x336699, alpha: 0.2 }), { placement: 'bottom' });
  const late = screen.addChild(new Container());
  const sheet = screen.children[0]!;
  assert.ok(screen.getChildIndex(sheet) < screen.getChildIndex(early));
  assert.ok(screen.getChildIndex(sheet) < screen.getChildIndex(late));
  grade.update(0);
  assert.equal(sheet.visible, true);
  grade.destroy();
});

test('a grade goes under the parent it is given, on top by default', () => {
  const screen = new Container();
  const parent = new Container();
  parent.addChild(new Container());
  new ColorGrade({ screen } as unknown as Stage, () => null, { parent });
  assert.equal(screen.children.length, 0);
  assert.equal(parent.children.length, 2);
});
