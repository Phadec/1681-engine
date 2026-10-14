import { Sprite, Texture, type Application } from 'pixi.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { ScrollView } from '../../src/ui/ScrollView';
import { destroyApp, makeApp, renderAndRead, rgb } from './gl';

let app: Application;
beforeEach(async () => {
  app = await makeApp(64, 64);
});
afterEach(() => destroyApp(app));

test('a measured scroll view clips its content to the box and scrolls through all of it', () => {
  const view = new ScrollView({ width: 32, height: 20, barColor: null });
  view.position.set(8, 8);
  // three bands, 20 px each: red, green, blue
  [0xff0000, 0x00ff00, 0x0000ff].forEach((color, i) => {
    const s = new Sprite(Texture.WHITE);
    s.tint = color;
    s.setSize(32, 20);
    s.y = i * 20;
    view.content.addChild(s);
  });
  app.stage.addChild(view);
  view.measure();
  expect(view.contentHeight).toBe(60);
  let f = renderAndRead(app);
  expect(f.at(20, 18)).toEqual(rgb(0xff0000));
  // below the box nothing shows: the green band is clipped
  expect(f.at(20, 32)).toEqual([0, 0, 0, 255]);
  expect(view.scrollTo(1000)).toBe(true);
  expect(view.scrollY).toBe(40);
  f = renderAndRead(app);
  expect(f.at(20, 18)).toEqual(rgb(0x0000ff));
  expect(f.at(20, 4)).toEqual([0, 0, 0, 255]);
});
