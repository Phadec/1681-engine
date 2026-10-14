import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Container } from 'pixi.js';
import { Pointer } from '../core/Pointer';
import type { Stage } from '../core/Stage';
import { Bar } from './Bar';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { List } from './List';
import { Slider } from './Slider';
import { UiPointerGate } from './UiPointerGate';
import { UiRoot } from './UiRoot';

const skin = { normal: { color: 0x333333 }, hover: { color: 0x555555 } };

/** A stage with stand-ins for the pieces a UiRoot touches; no canvas under node. */
function fakeStage(width = 320, height = 180) {
  const resize: (() => void)[] = [];
  const ticks: ((t: { deltaMS: number }) => void)[] = [];
  const stage = {
    width,
    height,
    screen: new Container(),
    cameras: { main: { roundPixels: true } },
    onResize: (fn: () => void) => (resize.push(fn), () => resize.splice(resize.indexOf(fn), 1)),
    app: { ticker: { add: (fn: (t: { deltaMS: number }) => void) => ticks.push(fn), remove: (fn: (t: { deltaMS: number }) => void) => ticks.splice(ticks.indexOf(fn), 1) } },
  };
  return {
    stage: stage as unknown as Stage,
    resizeTo(w: number, h: number) {
      stage.width = w;
      stage.height = h;
      for (const fn of resize) fn();
    },
    frame: (ms: number) => ticks.forEach((t) => t({ deltaMS: ms })),
    ticks,
  };
}

/** Presses the named actions for one step. */
const press = (...names: string[]) => ({ pressed: (a: string) => names.includes(a) });

test('the pointer gate tells Pointer to leave out a press a widget took, and keeps the game hook', () => {
  const before = Pointer.ignorePress;
  const gameHook = (e: PointerEvent) => (e as unknown as { shift: boolean }).shift;
  Pointer.ignorePress = gameHook;
  const uninstall = UiPointerGate.install();
  const taken = { shift: false } as unknown as PointerEvent;
  const free = { shift: false } as unknown as PointerEvent;
  UiPointerGate.consume(taken);
  assert.equal(Pointer.ignorePress!(taken), true);
  assert.equal(Pointer.ignorePress!(free), false);
  assert.equal(Pointer.ignorePress!({ shift: true } as unknown as PointerEvent), true, 'the game hook still answers');
  uninstall();
  assert.equal(Pointer.ignorePress, gameHook);
  Pointer.ignorePress = before;
});

test('a root pins HUD pieces to corners on whole pixels and moves them on resize', () => {
  const f = fakeStage();
  const ui = new UiRoot(f.stage);
  const bar = new Bar({ width: 41, height: 5, color: 0xff0000 });
  ui.pin(bar, 'bottom-right', 4.5);
  assert.deepEqual([bar.x, bar.y], [275, 171]);
  f.resizeTo(400, 300);
  assert.deepEqual([bar.x, bar.y], [355, 291]);
  ui.destroy();
  assert.equal(f.ticks.length, 0, 'its ticker listener goes with it');
});

test('a bar under a root drains its trail on the root ticker, then stops ticking', () => {
  const f = fakeStage();
  const ui = new UiRoot(f.stage);
  const bar = new Bar({ width: 40, height: 4, color: 0xff0000, delayMs: 100, rate: 2 });
  ui.pin(bar, 'top-left');
  bar.setValue(0.5);
  assert.equal(bar.trailValue, 1);
  for (let i = 0; i < 40; i++) f.frame(16);
  assert.equal(bar.trailValue, 0.5);
  ui.destroy();
});

test('arrows move focus between buttons, Accept clicks, and a slider uses left/right itself', () => {
  const f = fakeStage();
  const ui = new UiRoot(f.stage);
  let clicked = '';
  const a = new Button({ width: 30, height: 10, skin, onClick: () => (clicked = 'a') }).place(0, 0);
  const b = new Button({ width: 30, height: 10, skin, onClick: () => (clicked = 'b') }).place(0, 20);
  const s = new Slider({ width: 50, height: 6, track: { color: 0 }, knob: { color: 1 }, step: 0.1, value: 0.5 }).place(0, 40);
  ui.addChild(a, b, s);
  ui.invalidateFocus();
  assert.ok(ui.handleInput(press('ui_down')));
  assert.equal(ui.focus.focused, a);
  assert.ok(ui.capturesInput);
  ui.handleInput(press('ui_down'));
  ui.handleInput(press('ui_accept'));
  assert.equal(clicked, 'b');
  ui.handleInput(press('ui_down'));
  assert.equal(ui.focus.focused, s);
  ui.handleInput(press('ui_right'));
  assert.equal(ui.focus.focused, s, 'the slider kept the focus');
  assert.equal(s.value, 0.6);
  b.enabled = false;
  ui.handleInput(press('ui_up'));
  assert.equal(ui.focus.focused, a, 'a disabled button is skipped');
  ui.handleInput(press('ui_cancel'));
  assert.equal(ui.focus.focused, null);
  assert.ok(!ui.capturesInput);
  ui.destroy();
});

test('a dialog traps focus inside itself and closes on Cancel', () => {
  const f = fakeStage();
  const ui = new UiRoot(f.stage);
  const outside = new Button({ width: 30, height: 10, skin }).place(0, 0);
  ui.addChild(outside);
  const ok = new Button({ width: 30, height: 10, skin });
  let closed = 0;
  const dialog = new Dialog({ width: 100, height: 60, frame: { color: 0x222222 }, content: ok, onClose: () => closed++ });
  dialog.open(ui);
  assert.ok(ui.capturesInput);
  ui.handleInput(press('ui_down'));
  assert.equal(ui.focus.focused, ok);
  ui.handleInput(press('ui_up'));
  ui.handleInput(press('ui_next'));
  assert.equal(ui.focus.focused, ok, 'focus never leaves the dialog');
  ui.handleInput(press('ui_cancel'));
  assert.equal(closed, 1);
  assert.ok(!dialog.isOpen);
  ui.handleInput(press('ui_down'));
  assert.equal(ui.focus.focused, outside);
  ui.destroy();
});

test('a list stacks its rows and scrolls held to its content', () => {
  const list = new List({ width: 50, height: 30, gap: 2 });
  for (let i = 0; i < 5; i++) list.add(new Button({ width: 10, height: 10, skin }));
  assert.equal(list.contentHeight, 58);
  assert.equal(list.items[4]!.y, 48);
  assert.equal((list.items[0] as Button).boxWidth, 50, 'rows stretched to the list');
  assert.ok(list.scrollTo(100));
  assert.equal(list.scrollY, 28);
  list.reveal(list.items[0]!);
  assert.equal(list.scrollY, 0);
});
