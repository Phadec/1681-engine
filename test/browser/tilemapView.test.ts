import type { Application } from 'pixi.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { FLIP_H, parseTiled } from '../../src/tilemap/tiled';
import { TilemapView } from '../../src/tilemap/TilemapView';
import { canvasOf, destroyApp, makeApp, renderAndRead, rgb, TestStage } from './gl';

let app: Application;
let stage: TestStage;
beforeEach(async () => {
  app = await makeApp(64, 48);
  stage = new TestStage(app);
  // a tileset of four 8×8 tiles: red, green, blue, and one half white (left) half black, to see a flip
  stage.textures.addCanvas(
    'tiles',
    canvasOf(32, 8, (g) => {
      for (const [i, c] of ['#ff0000', '#00ff00', '#0000ff'].entries()) {
        g.fillStyle = c;
        g.fillRect(i * 8, 0, 8, 8);
      }
      g.fillStyle = '#ffffff';
      g.fillRect(24, 0, 4, 8);
    }),
  );
});
afterEach(() => destroyApp(app));

function map(data: number[], width = 8, height = 6, extra: Record<string, unknown>[] = []) {
  return parseTiled({
    width,
    height,
    tilewidth: 8,
    tileheight: 8,
    orientation: 'orthogonal',
    infinite: false,
    layers: [{ type: 'tilelayer', name: 'ground', visible: true, opacity: 1, data }, ...extra],
    tilesets: [{ firstgid: 1, name: 'tiles', image: 'tiles.png', imagewidth: 32, imageheight: 8, tilewidth: 8, tileheight: 8, columns: 4, tilecount: 4 }],
  });
}

function draw() {
  stage.frame(16);
  return renderAndRead(app);
}

test('tiles are drawn on their cells, flips kept, empty cells left clear', () => {
  const data = new Array(48).fill(0);
  data[0] = 1;
  data[1] = 2;
  data[8] = 3;
  data[9] = 4;
  data[10] = 4 | FLIP_H;
  const view = new TilemapView(stage, map(data));
  const f = draw();
  expect(f.at(3, 3)).toEqual(rgb(0xff0000));
  expect(f.at(11, 3)).toEqual(rgb(0x00ff00));
  expect(f.at(3, 11)).toEqual(rgb(0x0000ff));
  // the half tile: white on the left as drawn, on the right when flipped
  expect(f.at(9, 11)).toEqual(rgb(0xffffff));
  expect(f.at(14, 11)).toEqual([0, 0, 0, 255]);
  expect(f.at(17, 11)).toEqual([0, 0, 0, 255]);
  expect(f.at(22, 11)).toEqual(rgb(0xffffff));
  expect(f.at(40, 40)).toEqual([0, 0, 0, 255]);
  expect([view.widthPx, view.heightPx]).toEqual([64, 48]);
  view.destroy();
});

test('a repaint after the data changed shows the new tiles, and a chunk emptied is dropped', () => {
  const data = new Array(48).fill(1);
  const m = map(data);
  const view = new TilemapView(stage, m, { chunkTiles: 4 });
  expect(draw().at(4, 4)).toEqual(rgb(0xff0000));
  const layer = m.layers[0] as unknown as { data: number[] };
  layer.data[0] = 3;
  // a chunk of 4×4 tiles: clear one of them out entirely
  for (let y = 0; y < 4; y++) for (let x = 4; x < 8; x++) layer.data[y * 8 + x] = 0;
  const cells = [0, ...Array.from({ length: 16 }, (_, k) => Math.floor(k / 4) * 8 + 4 + (k % 4))];
  view.refreshTiles('ground', cells);
  const f = draw();
  expect(f.at(4, 4)).toEqual(rgb(0x0000ff));
  // the rest of the chunk is still there
  expect(f.at(12, 4)).toEqual(rgb(0xff0000));
  expect(f.at(40, 4)).toEqual([0, 0, 0, 255]);
  // chunks not touched stay
  expect(f.at(40, 40)).toEqual(rgb(0xff0000));
  view.refreshTiles('nope', [0]);
  view.refreshTiles('ground', [-1, 9999]);
  view.destroy();
});

test('chunks out of the camera\'s view are hidden, and shown again when it comes back', () => {
  const view = new TilemapView(stage, map(new Array(40 * 6).fill(2), 40, 6), { chunkTiles: 4 });
  const visible = () => [...view.layers.get('ground')!.children].filter((c) => c.visible).length;
  const all = view.layers.get('ground')!.children.length;
  stage.frame(16);
  view.update(0);
  const near = visible();
  expect(near).toBeLessThan(all);
  stage.cameras.main.setScroll(192, 0); // on a chunk edge: two columns in view, as at the start
  stage.frame(16);
  view.update(0);
  expect(visible()).toBe(near);
  expect(view.layers.get('ground')!.children[0]!.visible).toBe(false);
  expect(renderAndRead(app).at(10, 10)).toEqual(rgb(0x00ff00));
  view.destroy();
});

test('a layer\'s depth property, opacity and the map\'s position are honoured; layers can be picked by name', () => {
  const ground = new Array(48).fill(1);
  const roof = new Array(48).fill(0);
  roof[0] = 3;
  const m = map(ground, 8, 6, [{ type: 'tilelayer', name: 'roof', visible: true, opacity: 0.5, data: roof, properties: [{ name: 'depth', type: 'float', value: 1e6 }] }]);
  const view = new TilemapView(stage, m, { x: 8, y: 0 });
  expect(view.layers.get('roof')!.zIndex).toBe(1e6);
  expect(view.layers.get('ground')!.zIndex).toBe(-1_000_000);
  const f = draw();
  // the map starts 8 px in; the half-see-through blue roof over red
  expect(f.at(3, 3)).toEqual([0, 0, 0, 255]);
  const c = f.at(11, 3);
  expect(Math.abs(c[0] - 128)).toBeLessThanOrEqual(2);
  expect(Math.abs(c[2] - 128)).toBeLessThanOrEqual(2);
  view.destroy();
  const only = new TilemapView(stage, m, { layers: ['roof'] });
  expect([...only.layers.keys()]).toEqual(['roof']);
  only.destroy();
});
