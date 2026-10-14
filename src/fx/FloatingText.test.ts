import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BitmapLabel } from '../core/BitmapLabel.ts';
import type { Stage } from '../core/Stage.ts';
import { Tweener } from '../core/Tweener.ts';
import { FloatingText } from './FloatingText.ts';

/** A label with the parts the pool touches; baking a real font needs a canvas node does not have. */
class FakeLabel {
  text: string;
  alpha = 1;
  visible = true;
  destroyed = false;
  scaleX = 1;
  scaleY = 1;
  depth = 0;
  readonly position: { x: number; y: number; set(x: number, y: number): void };
  constructor(x: number, y: number, text: string, readonly size: number, readonly color: string) {
    this.text = text;
    const p = { x, y, set: (nx: number, ny: number) => ((p.x = nx), (p.y = ny)) };
    this.position = p;
  }
  get x(): number {
    return this.position.x;
  }
  set x(v: number) {
    this.position.x = v;
  }
  get y(): number {
    return this.position.y;
  }
  set y(v: number) {
    this.position.y = v;
  }
  setOrigin(): this {
    return this;
  }
  setText(t: string): this {
    this.text = t;
    return this;
  }
  setScale(s: number): this {
    this.scaleX = this.scaleY = s;
    return this;
  }
  setDepth(d: number): this {
    this.depth = d;
    return this;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

function fakeStage(): { stage: Stage; made: FakeLabel[] } {
  const made: FakeLabel[] = [];
  const stage = {
    tweens: new Tweener(),
    add: {
      label: (x: number, y: number, text: string, _f: string, size: number, color: string) => {
        const l = new FakeLabel(x, y, text, size, color);
        made.push(l);
        return l;
      },
    },
  } as unknown as Stage;
  return { stage, made };
}

const WHITE = { size: 9, color: '#ffffff' };
const GOLD = { size: 12, color: '#ffb13b' };

test('a released label is reused for its own style only', () => {
  const { stage, made } = fakeStage();
  const ft = new FloatingText(stage, { fontFamily: 'Test', depth: 7 });
  const a = ft.take(1, 2, '10', WHITE);
  ft.release(a, WHITE);
  assert.equal((a as unknown as FakeLabel).visible, false);
  const b = ft.take(5, 6, '20', WHITE) as unknown as FakeLabel;
  assert.equal(b, a as unknown as FakeLabel);
  assert.equal(b.text, '20');
  assert.equal(b.visible, true);
  assert.equal(b.depth, 7);
  assert.deepEqual([b.x, b.y], [5, 6]);
  ft.take(0, 0, '1', GOLD);
  assert.equal(made.length, 2);
});

test('the pool keeps only so many of a style and skips destroyed labels', () => {
  const { stage, made } = fakeStage();
  const ft = new FloatingText(stage, { fontFamily: 'Test', keepPerStyle: 2 });
  const labels = [0, 1, 2].map(() => ft.take(0, 0, 'x', WHITE));
  labels.forEach((l) => ft.release(l, WHITE));
  assert.equal(made[2]!.destroyed, true);
  made[1]!.destroy();
  assert.equal(ft.take(0, 0, 'y', WHITE) as unknown as FakeLabel, made[0]);
  assert.equal(ft.take(0, 0, 'z', WHITE) as unknown as FakeLabel, made[3]);
});

test('a floated label rises, fades and goes back to the pool by itself', () => {
  const { stage, made } = fakeStage();
  const ft = new FloatingText(stage, { fontFamily: 'Test' });
  ft.float(10, 50, '42', WHITE, { rise: 20, holdMs: 100, fadeMs: 200, popMs: 50 });
  for (let i = 0; i < 30; i++) stage.tweens.update(16);
  const l = made[0]!;
  assert.ok(Math.abs(l.y - 30) < 1e-9);
  assert.ok(Math.abs(l.alpha) < 1e-9);
  assert.equal(l.scaleX, 1);
  assert.equal(l.visible, false);
  assert.equal(ft.take(0, 0, 'again', WHITE) as unknown as FakeLabel, l);
});

test('labels go under the parent given, so they leave with it', () => {
  const { stage, made } = fakeStage();
  const added: unknown[] = [];
  const parent = { addChild: (c: unknown) => added.push(c) };
  const ft = new FloatingText(stage, { fontFamily: 'Test', parent: parent as never });
  const a = ft.take(0, 0, '1', WHITE);
  ft.release(a, WHITE);
  ft.take(0, 0, '2', WHITE);
  assert.deepEqual(added, [made[0]], 'added once, when made; a reused label is already there');
});
