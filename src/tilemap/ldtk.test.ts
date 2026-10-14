import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AssetLoader, type AssetLoaderOptions } from '../assets/AssetLoader.ts';
import { collisionFromIntGrid, collisionFromTiled } from './collision.ts';
import { entitiesOf, intGridAt, levelAt, levelByName } from './ldtk.ts';
import { ldtkExternalLevels, loadLdtkLevel, parseLdtk } from './ldtkParse.ts';
import { FLIP_H, FLIP_V, gidOf, layerByName, objectsOf, tileAt } from './tiled.ts';

/*
 * A hand-written project, as small as LDtk's format allows: one 2-tile tileset (plus the embedded icon atlas, which
 * has no file), two levels laid out horizontally, the second saved in its own file.
 */
const tile = (x: number, y: number, t: number, f = 0) => ({ px: [x, y], src: [t * 16, 0], f, t, d: [], a: 1 });
const field = (id: string, value: unknown) => ({ __identifier: id, __type: 'Any', __value: value, defUid: 0 });

const PROJECT = {
  jsonVersion: '1.5.3',
  defaultGridSize: 16,
  bgColor: '#40465B',
  worldLayout: 'LinearHorizontal',
  externalLevels: true,
  defs: {
    layers: [{ uid: 10, identifier: 'Walls', type: 'IntGrid', gridSize: 16, intGridValues: [{ value: 1, identifier: 'wall' }, { value: 2, identifier: 'water' }] }],
    tilesets: [
      { uid: 1, identifier: 'Tiles', relPath: '../art/tiles.png', pxWid: 32, pxHei: 16, tileGridSize: 16, spacing: 0, padding: 0, __cWid: 2, __cHei: 1, customData: [{ tileId: 0, data: 'grass' }], enumTags: [{ enumValueId: 'Wall', tileIds: [1] }] },
      { uid: 2, identifier: 'Internal_Icons', relPath: null, pxWid: 16, pxHei: 16, tileGridSize: 16, __cWid: 1, __cHei: 1 },
    ],
  },
  levels: [
    {
      identifier: 'Start',
      iid: 'a1',
      uid: 0,
      worldX: -1,
      worldY: -1,
      worldDepth: 0,
      pxWid: 48,
      pxHei: 32,
      __bgColor: '#112233',
      fieldInstances: [field('music', 'calm')],
      externalRelPath: null,
      layerInstances: [
        {
          __identifier: 'Things',
          __type: 'Entities',
          __cWid: 3,
          __cHei: 2,
          __gridSize: 16,
          __opacity: 1,
          __pxTotalOffsetX: 0,
          __pxTotalOffsetY: 0,
          visible: true,
          entityInstances: [
            { __identifier: 'Player', __grid: [0, 1], __pivot: [0.5, 1], __tags: ['hero'], iid: 'p1', width: 16, height: 16, px: [8, 32], fieldInstances: [] },
            { __identifier: 'Chest', __grid: [2, 0], __pivot: [0, 0], __tags: [], iid: 'c1', width: 16, height: 16, px: [32, 0], fieldInstances: [field('gold', 12), field('loot', ['key', 'gem']), field('to', { cx: 1, cy: 1 })] },
          ],
        },
        {
          __identifier: 'Decor',
          __type: 'Tiles',
          __cWid: 3,
          __cHei: 2,
          __gridSize: 16,
          __opacity: 0.5,
          __pxTotalOffsetX: 0,
          __pxTotalOffsetY: 0,
          __tilesetDefUid: 1,
          visible: true,
          gridTiles: [tile(0, 0, 0, 1), tile(0, 0, 1, 2), tile(16, 16, 1, 3)],
        },
        {
          __identifier: 'Walls',
          __type: 'IntGrid',
          __cWid: 3,
          __cHei: 2,
          __gridSize: 16,
          __opacity: 1,
          __pxTotalOffsetX: 0,
          __pxTotalOffsetY: 0,
          __tilesetDefUid: 1,
          layerDefUid: 10,
          visible: true,
          intGridCsv: [1, 0, 0, 1, 2, 0],
          autoLayerTiles: [tile(0, 0, 1), tile(0, 16, 1)],
        },
      ],
    },
    { identifier: 'Next', iid: 'b2', uid: 1, worldX: -1, worldY: -1, worldDepth: 0, pxWid: 32, pxHei: 32, fieldInstances: [], externalRelPath: 'world/Next.ldtkl', layerInstances: null },
  ],
};

const NEXT_LEVEL = {
  identifier: 'Next',
  iid: 'b2',
  pxWid: 32,
  pxHei: 32,
  fieldInstances: [field('boss', true)],
  layerInstances: [{ __identifier: 'Walls', __type: 'IntGrid', __cWid: 2, __cHei: 2, __gridSize: 16, layerDefUid: 10, intGridCsv: [0, 1, 1, 0], autoLayerTiles: [] }],
};

test('a level becomes a TileMap: layers bottom first, gids over the tilesets with an image, flips kept', () => {
  const project = parseLdtk(PROJECT, { levels: { 'world/Next.ldtkl': NEXT_LEVEL } });
  assert.equal(project.tilesets.length, 1, 'the icon atlas has no file and is left out');
  const ts = project.tilesets[0]!;
  assert.equal(ts.firstGid, 1);
  assert.equal(ts.image, '../art/tiles.png');
  assert.equal(ts.tileProperties.get(0)?.data, 'grass');
  assert.equal(ts.tileProperties.get(1)?.Wall, true, 'an enum tag reads as a boolean property');

  const start = levelByName(project, 'Start')!;
  const map = start.map;
  assert.deepEqual([map.width, map.height, map.tileWidth, map.backgroundColor], [3, 2, 16, '#112233']);
  assert.deepEqual(map.layers.map((l) => l.name), ['Walls', 'Decor', 'Decor#1', 'Things']);
  const decor = layerByName(map, 'Decor');
  assert.ok(decor?.kind === 'tiles');
  assert.equal(decor.opacity, 0.5);
  assert.equal(decor.data[0], (1 | FLIP_H) >>> 0, 'tile 0 flipped on x');
  assert.equal(decor.data[4], (2 | FLIP_H | FLIP_V) >>> 0);
  const over = layerByName(map, 'Decor#1');
  assert.ok(over?.kind === 'tiles');
  assert.equal(gidOf(over.data[0]!), 2, 'the second tile of a cell is drawn over the first');
  assert.equal((over.data[0]! & FLIP_V) !== 0, true);
  const walls = layerByName(map, 'Walls');
  assert.ok(walls?.kind === 'tiles');
  assert.equal(tileAt(map, walls.data[3]!)?.local, 1);
  assert.equal(start.fields.music, 'calm');
  assert.equal(map.properties.music, 'calm');
});

test('IntGrid values, their names and collision by a predicate or a list', () => {
  const start = parseLdtk(PROJECT).levels[0]!;
  const grid = start.intGrids.get('Walls')!;
  assert.equal(intGridAt(grid, 1, 1), 2);
  assert.equal(intGridAt(grid, 9, 9), 0);
  assert.equal(grid.names.get(2), 'water');
  assert.deepEqual([...collisionFromIntGrid(grid, [1]).solid], [1, 0, 0, 1, 0, 0]);
  assert.deepEqual([...collisionFromIntGrid(grid, (_v, name) => name === 'wall' || name === 'water').solid], [1, 0, 0, 1, 1, 0]);
  // the drawn wall tiles carry the Wall tag, so the Tiled rule finds them too
  assert.deepEqual([...collisionFromTiled(start.map, { solid: { property: 'Wall' } }).solid], [1, 0, 0, 1, 1, 0]);
});

test('entities keep their pivot point and fields, and appear as Tiled objects', () => {
  const start = parseLdtk(PROJECT).levels[0]!;
  const [player] = entitiesOf(start, 'Player');
  assert.deepEqual([player!.x, player!.y, player!.cx, player!.cy, player!.tags], [8, 32, 0, 1, ['hero']]);
  const chest = entitiesOf(start, 'Chest')[0]!;
  assert.deepEqual(chest.fields.loot, ['key', 'gem']);
  assert.deepEqual(chest.fields.to, { cx: 1, cy: 1 });
  const obj = objectsOf(start.map, 'Player')[0]!;
  assert.deepEqual([obj.x, obj.y, obj.width], [0, 16, 16], 'the object is the rectangle, top-left first');
  assert.deepEqual(objectsOf(start.map, 'Chest')[0]!.properties, { gold: 12 }, 'only scalar fields fit Properties');
});

test('linear layouts are laid end to end; external levels load when given, or wait', () => {
  assert.deepEqual(ldtkExternalLevels(PROJECT), ['world/Next.ldtkl']);
  const waiting = parseLdtk(PROJECT);
  const next = levelByName(waiting, 'b2')!;
  assert.equal(next.loaded, false);
  assert.equal(next.externalRelPath, 'world/Next.ldtkl');
  assert.deepEqual([next.worldX, next.worldY], [48, 0]);
  assert.equal(levelAt(waiting.levels, 50, 10), next);
  assert.equal(levelAt(waiting.levels, 10, 40), null);

  loadLdtkLevel(waiting, PROJECT, next, NEXT_LEVEL);
  assert.equal(next.loaded, true);
  assert.equal(next.fields.boss, true);
  assert.deepEqual([next.worldX, next.map.width], [48, 2]);
  assert.equal(next.map.layers.length, 0, 'an IntGrid with no auto tiles draws nothing');
  assert.deepEqual([...next.intGrids.get('Walls')!.values], [0, 1, 1, 0]);
  assert.equal(waiting.worlds.length, 1);
  assert.equal(waiting.worlds[0]!.layout, 'LinearHorizontal');
});

test('multi-world projects keep their worlds, and bad input says what is wrong', () => {
  const multi = parseLdtk({ ...PROJECT, levels: [], worlds: [{ identifier: 'Over', iid: 'w', worldLayout: 'Free', levels: [{ ...PROJECT.levels[0], worldX: 100, worldY: 50 }] }] });
  assert.deepEqual([multi.worlds[0]!.identifier, multi.levels[0]!.worldX], ['Over', 100]);
  assert.throws(() => parseLdtk({}), /LDtk project: not an LDtk project/);
  const badGrid = structuredClone(PROJECT);
  badGrid.levels[0]!.layerInstances![1]!.__gridSize = 8;
  assert.throws(() => parseLdtk(badGrid), /"Walls" has a 16 px grid, not 8: every tile and IntGrid layer/);
});

test('AssetLoader.ldtk fetches the project, its level files and its tileset images', async () => {
  const files: Record<string, unknown> = { 'maps/game.ldtk': PROJECT, 'maps/world/Next.ldtkl': NEXT_LEVEL, 'art/tiles.png': 'png' };
  const fetched: string[] = [];
  const textures: string[] = [];
  const options: AssetLoaderOptions = {
    fetch: async (url) => {
      fetched.push(url);
      const body = files[url];
      return { ok: body !== undefined, status: body === undefined ? 404 : 200, blob: async () => new Blob(['x']), json: async () => body, text: async () => '' };
    },
    toCanvas: async () => ({ width: 32, height: 16 }) as HTMLCanvasElement,
  };
  const loader = new AssetLoader({ addCanvas: (k) => textures.push(k), addSpriteSheet: () => undefined }, options);
  loader.ldtk('game', 'maps/game.ldtk');
  await loader.load();
  assert.deepEqual(fetched.sort(), ['art/tiles.png', 'maps/game.ldtk', 'maps/world/Next.ldtkl']);
  assert.deepEqual(textures, ['Tiles']);
  assert.equal(levelByName(loader.ldtkProject('game'), 'Next')!.loaded, true);

  const some = new AssetLoader({ addCanvas: () => undefined, addSpriteSheet: () => undefined }, options);
  some.ldtk('game', 'maps/game.ldtk', { levels: ['Start'] });
  await some.load();
  assert.equal(levelByName(some.ldtkProject('game'), 'Next')!.loaded, false, 'a level not asked for waits');
});
