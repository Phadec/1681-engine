import type { Application } from 'pixi.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { PixelMarks } from '../../src/pixel/PixelMarks';
import { ringPixels } from '../../src/pixel/aimPixels';
import { destroyApp, makeApp, renderAndRead, rgb, TestStage } from './gl';

const TONES = { aim: { light: 0xffffff, rim: 0x00ff00, dark: 0x0000ff, fill: 0xff0000 } };

let app: Application;
let marks: PixelMarks<'aim'>;
beforeEach(async () => {
  app = await makeApp(64, 64);
  marks = new PixelMarks(new TestStage(app), { tones: TONES });
});
afterEach(() => {
  marks.destroy();
  destroyApp(app);
});

test('a ring is drawn on whole pixels exactly where ringPixels puts it, dark on both sides', () => {
  marks.begin();
  marks.ring(32, 32, 10, 'aim');
  marks.end();
  const f = renderAndRead(app);
  const ring = ringPixels(10);
  expect(ring.length).toBeGreaterThan(20);
  for (const [x, y] of ring) expect(f.at(32 + x, 32 + y)).toEqual(rgb(0xffffff));
  expect(f.count((c) => c[0] === 255 && c[1] === 255)).toBe(ring.length);
  expect(f.at(32 + 11, 32)).toEqual(rgb(0x0000ff));
  expect(f.at(32 + 9, 32)).toEqual(rgb(0x0000ff));
  expect(f.at(32, 32)).toEqual(rgb(0));
});

test('a mark not placed next frame is hidden, and placing it again reuses what was painted', () => {
  marks.begin();
  marks.disc(20, 20, 6, 'aim');
  marks.end();
  let f = renderAndRead(app);
  expect(f.at(20, 20)).toEqual(rgb(0xffffff)); // the cross at its middle
  expect(f.at(17, 22)[0]).toBeGreaterThan(0); // the translucent red fill
  marks.begin();
  marks.end();
  f = renderAndRead(app);
  expect(f.count((c) => c[0] + c[1] + c[2] > 0)).toBe(0);
  const children = app.stage.children[0]!.children.length;
  marks.begin();
  marks.disc(40, 40, 6, 'aim');
  marks.end();
  expect(app.stage.children[0]!.children.length).toBe(children);
  f = renderAndRead(app);
  expect(f.at(40, 40)).toEqual(rgb(0xffffff));
  expect(f.at(20, 20)).toEqual(rgb(0));
});

test('an aim line is a row of chevrons along the angle, pooled frame to frame', () => {
  const draw = () => {
    marks.begin();
    marks.chevrons(0, 4, 32, 0, 0, 56, 4, 'aim');
    marks.end();
    return renderAndRead(app);
  };
  const f = draw();
  const lit = f.count((c) => c[0] === 255 && c[1] === 255);
  expect(lit).toBeGreaterThan(0);
  // chevrons, not a lane: along the line the row is broken by gaps
  let runs = 0;
  let on = false;
  for (let x = 0; x < 64; x++) {
    let any = false;
    for (let y = 26; y < 39; y++) if (f.at(x, y)[0] > 0 || f.at(x, y)[2] > 0) any = true;
    if (any && !on) runs++;
    on = any;
  }
  expect(runs).toBeGreaterThanOrEqual(4);
  // nothing strays off the line
  expect(f.count((c) => c[0] + c[1] + c[2] > 0, 0, 0, 64, 24)).toBe(0);
  const children = app.stage.children[0]!.children.length;
  expect(draw().count((c) => c[0] === 255 && c[1] === 255)).toBe(lit);
  expect(app.stage.children[0]!.children.length).toBe(children);
});
