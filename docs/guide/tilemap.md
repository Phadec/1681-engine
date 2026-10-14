# Tiled maps

Maps made in [Tiled](https://www.mapeditor.org) and saved as JSON (`.tmj` or `.json`) go through three steps:
`parseTiled` reads the file into a plain `TileMap` (layers, tilesets, objects, custom properties), `TilemapView` draws
its tile layers in chunks painted once into textures, and `collisionFromTiled` turns its solid tiles into the
`CollisionGrid` the movement code steps against. The reader is pure, with no Pixi and no DOM, so a server can read the
same file for the same collision. Object layers carry the rest: spawn points, chests, doors, triggers.

## Loading and drawing

`AssetLoader.tilemap` fetches the map, parses it and queues every tileset image it names, resolved beside the map
file:

```ts
import { AssetLoader, TilemapView, collisionFromTiled, objectsOf } from '1681-engine';

class Level extends Scene {
  private map!: TilemapView;

  override async onEnter() {
    const { stage } = this.engine;
    const assets = new AssetLoader(stage.textures);
    assets.tilemap('level', 'maps/level.tmj'); // the tilesets load under their names
    await assets.load(({ done, total }) => bar.set(done / total));
    const tiled = assets.map('level');

    this.map = new TilemapView(stage, tiled, { parent: this.root }); // the layers leave with the scene
    stage.cameras.main.setBounds(0, 0, this.map.widthPx, this.map.heightPx);
  }

  override update() {
    this.map.update(); // shows only the chunks in view
  }

  override onExit() {
    this.map.destroy(); // frees the chunk textures
  }
}
```

`TilemapViewOptions`:

| Option | Default | What it does |
|---|---|---|
| `textureFor` | `tileset.name` | The texture key holding a tileset's image. Must match the loader's `textureKey` if you changed it. |
| `chunkTiles` | 32 | Tiles per chunk side. Each chunk is one canvas texture. |
| `layers` | every visible tile layer | Only these tile layers, by name (hidden ones included when named). |
| `baseDepth` | −1,000,000 | Depth of the first layer; each layer after it one higher, so the map stays under bodies drawn at their y. |
| `parent` | the stage's world layer | Where the layer containers go. |

A tile layer with a numeric custom property `depth` is drawn at that depth instead: a roof layer with `depth` =
1e6 sits over every body. `view.layers` maps each drawn layer's name to its `Container`, with the layer's opacity and
offset already applied. `update(margin = 32)` toggles chunks against the main camera's view plus the margin.

Tiles taller than the grid (a 16×32 tree on a 16 px map) are drawn on their cell's bottom-left corner, as Tiled does,
and overhang the cell above; flipped and rotated tiles (the `FLIP_H`, `FLIP_V`, `FLIP_D` bits) are drawn flipped.

## Reading the map

```ts
import { FLIP_H, gidOf, layerByName, objectsOf, tileAt, tileRect } from '1681-engine';

const ground = layerByName(tiled, 'ground');
if (ground?.kind === 'tiles') {
  const raw = ground.data[ty * tiled.width + tx]!; // row-major gids, 0 = empty, flip flags kept
  const flipped = (raw & FLIP_H) !== 0;
  const t = tileAt(tiled, raw); // { tileset, local } or null for an empty cell or an unknown gid
  if (t) {
    const props = t.tileset.tileProperties.get(t.local); // the tile's custom properties
    const src = tileRect(t.tileset, t.local); // where it sits in the tileset image, margin and spacing included
    const id = gidOf(raw); // the gid without its flip bits
  }
}
```

A `TileMap` holds `width`, `height` (in tiles), `tileWidth`, `tileHeight`, `layers`, `tilesets`, `properties` and an
optional `backgroundColor`. Layers are a union on `kind`: `'tiles'` (`data`, `visible`, `opacity`, `offsetX`,
`offsetY`, `properties`) or `'objects'` (`objects`, `visible`, `properties`). A tileset keeps `tileProperties` and
`animations` per local tile id.

## Objects for spawns

```ts
const start = objectsOf(tiled, 'spawn')[0] ?? { x: 32, y: 32 }; // a point object whose class is "spawn"
for (const chest of objectsOf(tiled, 'chest')) {
  spawnChest(chest.x, chest.y, Number(chest.properties.gold ?? 0));
}
```

`objectsOf(map, type?)` returns every object of every object layer, optionally only one `type`. Tiled 1.9+ calls it
"class"; either field is read into `type`. A `MapObject` carries `id`, `name`, `x`, `y`, `width`, `height`,
`rotation`, `point`, `ellipse`, an optional `polygon` and `gid` (a tile object), and its `properties`.

## Collision

```ts
import { collisionFromTiled, createMover, stepMover } from '1681-engine';

// default: every non-empty cell of a layer named "collision", else tiles with a `solid` property
const grid = collisionFromTiled(tiled, { solid: { property: 'solid' }, bodyHalfWidth: 4, bodyHalfHeight: 3 });
const hero = createMover(start.x, start.y);
// each step:
stepMover(hero, [dx, dy, 0], params, grid);
```

`solid` is either a tile layer's name (each non-empty cell of it is solid; a hidden layer painted with any tile is
the usual way) or `{ property }` (a cell is solid when its tile has that custom property set to `true`, on any tile
layer). The other options are `CollisionGridOptions`: the moving body's half box (`bodyHalfWidth`, `bodyHalfHeight`,
default a 10×6 foot box) and `shotOverTiles`.

The same grid feeds the other modules:

```ts
import { findPath, navGridFromCollision, tileBodiesFromGrid } from '1681-engine';

const nav = navGridFromCollision(grid); // a solid tile is a wall
const route = findPath(nav, { x: 2, y: 3 }, { x: 20, y: 14 }); // tile points, or null

for (const body of tileBodiesFromGrid(grid, { friction: 0.8 })) physics.add(body); // merged static boxes
```

`tileBodies(width, height, tileSize, solid, options)` is the same over any `(tx, ty) => boolean`; see
[Physics](physics.md) and [Navigation](navigation.md).

[`examples/top-down`](/examples#top-down) loads a Tiled map with its tileset, draws it, reads collision from the tiles'
`solid` property and puts the hero on the `spawn` point; the map opens in Tiled for editing.

## Pitfalls

- **Embed the tilesets.** External `.tsj` tilesets are refused (Map → Embed Tilesets), and so are image-collection
  tilesets, infinite maps, compressed layer data (save as CSV or uncompressed base64) and isometric or hexagonal maps.
  The error names the setting to change.
- **Draw after loading.** `TilemapView` paints every chunk in its constructor; a tile whose tileset texture does not
  exist yet is silently skipped and never repainted. Wait for `assets.load()` first.
- **Animated tiles are drawn on their first frame.** The animations are parsed (`tileset.animations`) but not played.
- **Image layers are ignored**: draw backgrounds yourself.
- **Group layers are flattened.** Their visibility, opacity and offset multiply into each tile layer inside them, but
  object positions are not shifted by a group's or layer's offset.
- **Tile objects sit on their bottom edge.** Tiled stores a tile object's `y` at its bottom-left corner, and `rotation`
  is read but nothing applies it; account for both when placing a sprite from one.
- **Collision needs square tiles** and throws otherwise. It ignores layer offsets, and the `{ property }` rule reads
  hidden layers too.
- **The edge differs by module.** `isSolidTile` counts outside the grid as solid (a mover cannot walk off the map),
  while `tileBodies` counts it as open, so the map's border faces collide like any other.
- **Destroy the view.** Each chunk is a canvas texture in the stage's registry until `destroy()` removes it.
