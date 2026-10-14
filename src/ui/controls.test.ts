import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { Stage } from '../core/Stage';
import { Button } from './Button';
import { FocusManager } from './FocusManager';
import { Panel } from './Panel';
import { ScrollView } from './ScrollView';
import { Stack } from './Stack';
import { Toggle } from './Toggle';
import { UiRoot } from './UiRoot';

const skin = { normal: { color: 0x333333 }, hover: { color: 0x555555 } };

function fakeStage(width = 320, height = 180) {
  const ticks: ((t: { deltaMS: number }) => void)[] = [];
  const stage = {
    width,
    height,
    screen: new Container(),
    cameras: { main: { roundPixels: true } },
    onResize: () => () => undefined,
    app: { ticker: { add: (fn: (t: { deltaMS: number }) => void) => ticks.push(fn), remove: (fn: (t: { deltaMS: number }) => void) => ticks.splice(ticks.indexOf(fn), 1) } },
  };
  return { stage: stage as unknown as Stage, frame: (ms: number) => [...ticks].forEach((t) => t({ deltaMS: ms })) };
}

const press = (...names: string[]) => ({ pressed: (a: string) => names.includes(a) });
const button = (w = 30, h = 10) => new Button({ width: w, height: h, skin });

test('a toggle flips on a tap, on Accept, and from code; silent sets skip onChange; disabled it holds', () => {
  const seen: boolean[] = [];
  const t = new Toggle({ size: 12, box: { color: 0 }, mark: 0xffffff, onChange: (v) => seen.push(v) });
  assert.equal(t.value, false);
  assert.equal(t.focusable, true);
  t.emit('pointertap', {} as never);
  assert.equal(t.value, true);
  t.activate();
  assert.equal(t.value, false);
  t.set(true, true);
  assert.equal(t.value, true);
  assert.deepEqual(seen, [true, false]);
  t.set(true);
  assert.deepEqual(seen, [true, false], 'setting the same value tells nobody');
  t.enabled = false;
  t.activate();
  assert.equal(t.value, true);
  assert.equal(t.alpha, 0.5);
  t.set(false, true);
  assert.equal(t.value, false, 'a silent set still mirrors a setting into a disabled toggle');
});

test('a toggle draws its colour mark a quarter in, only while on, and its focus face only while focused', () => {
  const t = new Toggle({ size: 16, box: { color: 0 }, mark: 0xff0000, focus: { color: 1 }, value: true });
  const [, mark, focusFace] = t.children;
  assert.equal(mark!.visible, true);
  assert.deepEqual([mark!.x, mark!.y, mark!.width, mark!.height], [4, 4, 8, 8]);
  assert.equal(focusFace!.visible, false);
  t.setFocused(true);
  assert.equal(focusFace!.visible, true);
  t.activate();
  assert.equal(mark!.visible, false);
  assert.deepEqual([t.boxWidth, t.boxHeight], [16, 16]);
  assert.ok(t.hitArea instanceof Rectangle && t.hitArea.width === 16);
});

test('a stack lays its children down with gap and padding, takes their size, and skips the hidden', () => {
  const s = new Stack({ gap: 4, padding: 2 });
  const a = button(30, 10);
  const b = button(20, 6);
  const c = button(10, 10);
  s.add(a, b, c);
  assert.deepEqual([a.y, b.y, c.y], [2, 16, 26]);
  assert.deepEqual([s.boxWidth, s.boxHeight], [34, 38]);
  b.visible = false;
  s.layout();
  assert.deepEqual([a.y, c.y], [2, 16]);
  assert.equal(s.boxHeight, 28);
  s.remove(c, true);
  assert.equal(c.destroyed, true);
  assert.equal(s.children.length, 2);
  assert.equal(s.boxHeight, 14);
});

test('a stretched stack resizes its widgets to its cross size; across, it lays them side by side', () => {
  const down = new Stack({ align: 'stretch' });
  const a = button(30, 10);
  const b = button(10, 10);
  down.add(a, b);
  assert.equal(b.boxWidth, 30);
  const across = new Stack({ direction: 'horizontal', gap: 2 });
  const c = button(10, 10);
  const d = button(10, 10);
  across.add(c, d);
  assert.equal(d.x, 12);
  assert.equal(across.boxWidth, 22);
});

test('a scroll view clamps its scroll to the content, measures it, and brings a child into view', () => {
  const v = new ScrollView({ width: 50, height: 40 });
  const rows = Array.from({ length: 6 }, (_, i) => button(50, 20).place(0, i * 20));
  v.content.addChild(...rows);
  v.measure();
  assert.equal(v.contentHeight, 120);
  assert.equal(v.scrollTo(-10), false, 'already at the top');
  assert.equal(v.scrollTo(500), true);
  assert.equal(v.scrollY, 80);
  assert.equal(v.content.y, -80);
  v.reveal(rows[0]!);
  assert.equal(v.scrollY, 0);
  v.reveal(rows[4]!);
  assert.equal(v.scrollY, 60, 'the row is just in view at the bottom');
  v.setContentHeight(30);
  assert.equal(v.scrollY, 0, 'content shorter than the box cannot scroll');
  // measured again, the mask is still on: the content is still clipped to the box
  v.measure();
  assert.equal(v.contentHeight, 120);
  assert.equal(v.content.mask, v.children[1]);
});

test('the wheel scrolls by at most a step and is kept from what is under the view only when it moved', () => {
  const v = new ScrollView({ width: 50, height: 40, wheelStep: 10 });
  v.setContentHeight(100);
  let stopped = 0;
  const wheel = (deltaY: number) => v.emit('wheel', { deltaY, stopPropagation: () => stopped++ } as never);
  wheel(300);
  assert.equal(v.scrollY, 10);
  assert.equal(stopped, 1);
  wheel(-300);
  wheel(-300);
  assert.equal(v.scrollY, 0);
  assert.equal(stopped, 2, 'a wheel at the top goes on to the page');
});

test('the scroll bar is sized to the share in view and hidden when nothing scrolls', () => {
  const v = new ScrollView({ width: 50, height: 40, barWidth: 3 });
  const bar = v.children[2]!;
  v.setContentHeight(20);
  assert.equal(bar.visible, false);
  v.setContentHeight(160);
  assert.equal(bar.visible, true);
  assert.deepEqual([bar.width, bar.height, bar.x, bar.y], [3, 10, 47, 0]);
  v.scrollTo(120);
  assert.equal(bar.y, 30);
  const none = new ScrollView({ width: 50, height: 40, barColor: null });
  assert.equal(none.children.length, 2);
});

test('a drag past the slop scrolls and suppresses the tap; let go fast, it flings on the root and settles', () => {
  const f = fakeStage();
  const ui = new UiRoot(f.stage);
  const v = new ScrollView({ width: 50, height: 40, dragSlop: 6 });
  v.setContentHeight(400);
  ui.addChild(v);
  const at = (y: number) => ({ global: { y } }) as never;
  v.emit('pointerdown', at(30));
  v.emit('globalpointermove', at(27));
  assert.equal(v.suppressesTaps, false, 'inside the slop it is still a tap');
  assert.equal(v.scrollY, 0);
  v.emit('globalpointermove', at(10));
  assert.equal(v.suppressesTaps, true);
  assert.equal(v.scrollY, 20);
  v.emit('pointerup', {} as never);
  const flungFrom = v.scrollY;
  for (let i = 0; i < 200; i++) f.frame(16);
  assert.ok(v.scrollY > flungFrom, 'the fling carried on');
  const settled = v.scrollY;
  f.frame(16);
  assert.equal(v.scrollY, settled, 'and stopped');
  assert.equal(v.tick(16), false);
  // a new press is a tap again
  v.emit('pointerdown', at(30));
  assert.equal(v.suppressesTaps, false);
  v.destroy();
  ui.destroy();
});

test('a colour panel draws a border as four strips round its fill, and blocks presses over its box', () => {
  const p = new Panel({ color: 0x101010, border: 2, borderColor: 0xffffff }, 20, 10);
  const g = p.children[0] as Graphics;
  const b = g.getLocalBounds();
  assert.deepEqual([b.minX, b.minY, b.maxX, b.maxY], [0, 0, 20, 10]);
  assert.equal(p.eventMode, 'static');
  assert.ok(p.hitArea instanceof Rectangle);
  assert.deepEqual([p.hitArea.width, p.hitArea.height], [20, 10]);
  p.resize(30, 12);
  assert.deepEqual([(p.hitArea as Rectangle).width, (p.hitArea as Rectangle).height], [30, 12]);
  const ghost = new Panel({ color: 0 }, 10, 10, { blocksPointer: false });
  assert.ok(!ghost.hitArea);
  assert.notEqual(ghost.eventMode, 'static');
  const empty = new Panel({ color: 0 }, 0, 0);
  assert.equal((empty.children[0] as Graphics).getLocalBounds().maxX, 0, 'a box of no size draws nothing');
});

test('Tab steps in tree order and wraps; a hidden parent takes its widgets out of the order', () => {
  const root = new Container();
  const a = button();
  const group = new Container();
  const b = button().place(0, 20);
  const c = button().place(0, 40);
  group.addChild(b, c);
  root.addChild(a, group);
  const fm = new FocusManager(root);
  assert.ok(fm.step(1));
  assert.equal(fm.focused, a);
  fm.step(1);
  fm.step(1);
  assert.equal(fm.focused, c);
  fm.step(1);
  assert.equal(fm.focused, a, 'wrapped');
  fm.step(-1);
  assert.equal(fm.focused, c);
  group.visible = false;
  fm.invalidate();
  assert.equal(fm.focused, null, 'a focused widget that hid loses the focus');
  fm.step(1);
  fm.step(1);
  assert.equal(fm.focused, a, 'only a is left');
});

test('a destroyed focused widget lets go of the focus; with nothing to focus, moves are not used', () => {
  const root = new Container();
  const a = button();
  root.addChild(a);
  const fm = new FocusManager(root);
  fm.move('down');
  assert.equal(fm.focused, a);
  assert.equal(a.focused, true);
  a.destroy();
  fm.invalidate();
  assert.equal(fm.focused, null);
  assert.equal(fm.move('down'), false);
  assert.equal(fm.step(1), false);
  assert.equal(fm.handle(press('ui_accept', 'ui_cancel')), false);
});

test('a scope traps focus until popped; Cancel asks it first, and popping the root does nothing', () => {
  const root = new Container();
  const outside = button();
  const dialog = new Container();
  const inside = button().place(0, 50);
  dialog.addChild(inside);
  root.addChild(outside, dialog);
  const fm = new FocusManager(root);
  fm.step(1);
  assert.equal(fm.focused, outside);
  let cancels = 0;
  fm.pushScope(dialog, () => (cancels++, true));
  assert.equal(fm.scope, dialog);
  assert.equal(fm.focused, null, 'pushing a scope drops the focus outside it');
  fm.step(1);
  fm.step(1);
  assert.equal(fm.focused, inside);
  assert.ok(fm.handle(press('ui_cancel')));
  assert.equal(cancels, 1);
  assert.equal(fm.focused, inside, 'the scope used the Cancel');
  fm.popScope(root);
  assert.equal(fm.scope, dialog);
  fm.popScope(dialog);
  assert.equal(fm.scope, root);
  fm.step(1);
  assert.equal(fm.focused, outside);
  // a scope whose cancel declines: Cancel clears the focus instead
  fm.pushScope(dialog, () => false);
  fm.step(1);
  assert.ok(fm.handle(press('ui_cancel')));
  assert.equal(fm.focused, null);
});

test('Accept on a widget that cannot be focused any more does nothing', () => {
  const root = new Container();
  let clicks = 0;
  const a = new Button({ width: 30, height: 10, skin, onClick: () => clicks++ });
  root.addChild(a);
  const fm = new FocusManager(root, { up: 'u', down: 'd', left: 'l', right: 'r', accept: 'ok', cancel: 'back', next: 'tab', prev: 'stab' });
  assert.ok(fm.handle(press('d')));
  assert.ok(fm.handle(press('ok')));
  assert.equal(clicks, 1);
  a.visible = false;
  assert.equal(fm.handle(press('ok')), false);
  assert.equal(clicks, 1);
});
