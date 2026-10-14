import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Stage } from '../core/Stage';
import { PixelMarks } from './PixelMarks';

class FakeGraphics {
  visible = true;
  depth = 0;
  x = 0;
  y = 0;
  rects = 0;
  clears = 0;
  destroyed = false;
  setDepth(d: number) { this.depth = d; return this; }
  setVisible(v: boolean) { this.visible = v; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  fillStyle() { return this; }
  fillRect() { this.rects++; return this; }
  clear() { this.clears++; this.rects = 0; return this; }
  destroy() { this.destroyed = true; }
}

function setup() {
  const made: FakeGraphics[] = [];
  const stage = { add: { graphics: () => { const g = new FakeGraphics(); made.push(g); return g; } } } as unknown as Stage;
  const tone = { light: 0xffffff, rim: 0xcccccc, dark: 0x000000, fill: 0x888888 };
  return { made, marks: new PixelMarks(stage, { tones: { aim: tone, lock: tone }, depth: 42 }) };
}

test('a ring is painted once and only moved; a mark not placed this frame is hidden', () => {
  const { made, marks } = setup();
  marks.begin();
  marks.ring(10.4, 20.6, 8, 'lock');
  marks.end();
  assert.equal(made.length, 1);
  const g = made[0]!;
  assert.equal(g.depth, 42);
  assert.equal(g.visible, true);
  assert.deepEqual([g.x, g.y], [10, 21]);
  const painted = g.rects;
  marks.begin();
  marks.ring(50, 50, 8, 'lock');
  marks.end();
  assert.equal(made.length, 1, 'same size and tone: same graphics');
  assert.equal(g.rects, painted, 'not repainted');
  marks.begin();
  marks.end();
  assert.equal(g.visible, false);
});

test('chevrons come from a pool, repainted only when heading, size or tone change', () => {
  const { made, marks } = setup();
  marks.begin();
  marks.chevrons(0, 0, 0, 0, 10, 60, 4, 'aim');
  marks.end();
  const n = made.length;
  assert.ok(n >= 4);
  const clears = made.map((g) => g.clears);
  marks.begin();
  marks.chevrons(0, 5, 5, 0.01, 10, 60, 4, 'aim');
  marks.end();
  assert.equal(made.length, n);
  assert.deepEqual(made.map((g) => g.clears), clears, 'same heading bucket: nothing repainted');
  marks.begin();
  marks.pointer(0, 0, 0, 12, 4, 'aim');
  marks.end();
  assert.equal(made.filter((g) => g.visible).length, 1, 'the rest of the pool hidden');
  marks.destroy();
  assert.ok(made.every((g) => g.destroyed));
});
