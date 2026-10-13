import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collisionFromTiled } from './collision.ts';
import { FLIP_H, gidOf, objectsOf, parseTiled, tileAt, tileRect } from './tiled.ts';
import { isSolidTile } from '../net/movement.ts';

/** A 4×3 map in Tiled's JSON shape: ground, a collision layer, a group with a decoration layer, an object layer. */
function sample(overrides: Record<string, unknown> = {}) {
  return {
    width: 4,
    height: 3,
    tilewidth: 16,
    tileheight: 16,
    orientation: 'orthogonal',
    infinite: false,
    layers: [
      { type: 'tilelayer', name: 'ground', visible: true, opacity: 1, data: [1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1] },
      { type: 'tilelayer', name: 'collision', visible: false, opacity: 1, data: [3, 3, 3, 3, 3, 0, 0, 3, 3, 3, 3, 3] },
      {
        type: 'group',
        name: 'deco',
        opacity: 0.5,
        offsetx: 2,
        layers: [{ type: 'tilelayer', name: 'flowers', opacity: 0.5, data: [0, 0, 0, 0, 0, 4 | FLIP_H, 0, 0, 0, 0, 0, 0] }],
      },
      {
        type: 'objectgroup',
        name: 'things',
        objects: [
          { id: 1, name: 'start', type: 'spawn', x: 24, y: 24, width: 0, height: 0, point: true },
          { id: 2, name: '', class: 'chest', x: 40, y: 8, width: 16, height: 16, properties: [{ name: 'gold', type: 'int', value: 30 }] },
        ],
      },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'tiles',
        image: 'tiles.png',
        imagewidth: 64,
        imageheight: 16,
        tilewidth: 16,
        tileheight: 16,
        columns: 4,
        tilecount: 4,
        tiles: [
          { id: 2, properties: [{ name: 'solid', type: 'bool', value: true }] },
          { id: 0, animation: [{ tileid: 0, duration: 200 }, { tileid: 1, duration: 200 }] },
        ],
      },
    ],
    ...overrides,
  };
}

test('a map reads its layers, groups flattened with their opacity and offset, and its objects', () => {
  const map = parseTiled(sample());
  assert.equal(map.width, 4);
  assert.deepEqual(map.layers.map((l) => l.name), ['ground', 'collision', 'flowers', 'things']);
  const flowers = map.layers[2]!;
  assert.equal(flowers.kind, 'tiles');
  if (flowers.kind === 'tiles') {
    assert.equal(flowers.opacity, 0.25);
    assert.equal(flowers.offsetX, 2);
    assert.equal(gidOf(flowers.data[5]!), 4, 'the flip flag is kept on the raw gid and stripped by gidOf');
  }
  const [spawn] = objectsOf(map, 'spawn');
  assert.equal(spawn?.point, true);
  assert.equal(objectsOf(map, 'chest')[0]?.properties.gold, 30, 'class (Tiled 1.9+) is read as type');
  assert.equal(map.tilesets[0]!.animations.get(0)?.length, 2);
});

test('a gid is found in its tileset and its rectangle in the image', () => {
  const map = parseTiled(sample());
  const t = tileAt(map, 3);
  assert.equal(t?.local, 2);
  assert.deepEqual(tileRect(t!.tileset, t!.local), { x: 32, y: 0, w: 16, h: 16 });
  assert.equal(tileAt(map, 0), null);
  assert.equal(tileAt(map, 99), null, 'a gid past the tileset is nobody\'s');
});

test('base64 layer data reads the same as CSV', () => {
  const ground = [1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1];
  const bytes = Buffer.alloc(ground.length * 4);
  ground.forEach((g, i) => bytes.writeUInt32LE(g, i * 4));
  const m = sample();
  (m.layers[0] as Record<string, unknown>).encoding = 'base64';
  (m.layers[0] as Record<string, unknown>).data = bytes.toString('base64');
  const map = parseTiled(m);
  const layer = map.layers[0]!;
  assert.ok(layer.kind === 'tiles' && [...layer.data].join() === ground.join());
});

test('what the engine cannot read is refused with a message that says what to change', () => {
  assert.throws(() => parseTiled(sample({ infinite: true })), /Infinite/);
  assert.throws(() => parseTiled(sample({ orientation: 'isometric' })), /isometric/);
  assert.throws(() => parseTiled(sample({ tilesets: [{ firstgid: 1, source: 'tiles.tsj' }] })), /Embed Tilesets/);
  const compressed = sample();
  (compressed.layers[0] as Record<string, unknown>).compression = 'zlib';
  assert.throws(() => parseTiled(compressed), /zlib-compressed/);
  const short = sample();
  (short.layers[0] as Record<string, unknown>).data = [1, 2];
  assert.throws(() => parseTiled(short), /12 cells/);
});

test('collision comes from the "collision" layer by default, or from a tile property', () => {
  const map = parseTiled(sample());
  const byLayer = collisionFromTiled(map);
  assert.equal(isSolidTile(byLayer, 0, 0), true);
  assert.equal(isSolidTile(byLayer, 1, 1), false);
  const byProperty = collisionFromTiled(map, { solid: { property: 'solid' } });
  assert.equal(isSolidTile(byProperty, 0, 0), true, 'gid 3 is local tile 2, marked solid');
  assert.equal(isSolidTile(byProperty, 1, 1), false);
  assert.throws(() => collisionFromTiled(map, { solid: 'walls' }), /no tile layer named "walls"/);
});
