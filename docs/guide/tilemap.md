# Tile maps: Tiled, LDtk and autotiling

Maps made in [Tiled](https://www.mapeditor.org) and saved as JSON (`.tmj` or `.json`) go through three steps:
`parseTiled` reads the file into a plain `TileMap` (layers, tilesets, objects, custom properties), `TilemapView` draws
its tile layers in chunks painted once into textures, and `collisionFromTiled` turns its solid tiles into the
`CollisionGrid` the movement code steps against. The reader is pure, with no Pixi and no DOM, so a server can read the
same file for the same collision. Object layers carry the rest: spawn points, chests, doors, triggers.

[LDtk](#ldtk) projects are read into the same `TileMap`, so everything below works on them too, and
[autotiling](#autotiling) picks tiles from terrain by bitmask rules.

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
| `x`, `y` | 0, 0 | World position of the map's top-left corner (an LDtk level's `worldX`/`worldY`); culling counts it. |

A tile layer with a numeric custom property `depth` is drawn at that depth instead: a roof layer with `depth` =
1e6 sits over every body. `view.layers` maps each drawn layer's name to its `Container`, with the layer's opacity and
offset already applied. `update(margin = 32)` toggles chunks against the main camera's view plus the margin.

`refreshTiles(layerName, cells)` repaints the chunks holding those cells (row-major indices) after you changed the
layer's `data` — a door opened, a wall dug out, cells autotiled again. It costs one chunk's painting per chunk touched,
so call it on a change, not every frame.

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

## Tiled pitfalls

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

## LDtk

Projects made in [LDtk](https://ldtk.io) are read into the same `TileMap` a Tiled map becomes, one per level, so
`TilemapView`, `collisionFromTiled`, `objectsOf` and `tileAt` work on an LDtk level unchanged. `parseLdtk` is pure
like `parseTiled`. What LDtk has and Tiled has not rides beside the map on the `LdtkLevel`: IntGrid values, entity
fields as exported, the level's world position.

```ts
import { AssetLoader, TilemapView, collisionFromIntGrid, entitiesOf, levelByName } from '1681-engine';

const assets = new AssetLoader(stage.textures);
assets.ldtk('world', 'maps/world.ldtk'); // the project, each level's .ldtkl file, then every tileset image
await assets.load();
const project = assets.ldtkProject('world');

const level = levelByName(project, 'Level_0')!; // by identifier or iid
const view = new TilemapView(stage, level.map, { parent: this.root, x: level.worldX, y: level.worldY });
const grid = collisionFromIntGrid(level.intGrids.get('Collisions')!, (value, name) => name === 'wall' || value === 2);
const hero = entitiesOf(level, 'Player')[0]!; // x, y: the entity's pivot point, its fields in `fields`
```

What a level's `map` holds:

| LDtk | In the `TileMap` |
|---|---|
| Tiles layer (`gridTiles`) | a tile layer of the same name |
| AutoLayer, or an IntGrid with auto-layer rules (`autoLayerTiles`) | a tile layer of the same name |
| a cell stacking several tiles | the first in the layer, the next in `name#1`, `name#2`… drawn over it, in LDtk's order |
| Entities layer | an object layer: each entity a rectangle object (`x`, `y` its top-left), its scalar fields as `properties` |
| tile flips (`f`) | `FLIP_H`, `FLIP_V` on the gid |
| layer `__opacity`, `visible`, `__pxTotalOffsetX/Y` | the layer's `opacity`, `visible`, `offsetX/Y` |
| level fields | `map.properties` (scalars), every value on `level.fields` |
| tileset `customData` | tile property `data` (the string as written) |
| tileset enum tags | a `true` tile property named after each enum value, so `{ solid: { property: 'Wall' } }` reads them |

Layers come bottom first, as in Tiled (LDtk lists its layers top first). Every tileset with an image gets gids in
definition order, the same in every level, and its `name` is the tileset's identifier: the texture key the loader
uses.

`level.intGrids` maps each IntGrid layer's name to its values (`values`, row-major, 0 empty), the identifier LDtk gives
each value (`names`), its size and grid. `intGridAt(grid, cx, cy)` reads one cell (0 outside). `collisionFromIntGrid`
builds the same `CollisionGrid` as `collisionFromTiled` from the values a list names (`[1, 3]`) or a test of the value
and its name.

`level.entities` (or `entitiesOf(level, identifier?)`) keeps each entity's `iid`, `identifier`, pivot point `x`, `y`
(level px, the layer offset included), `width`, `height`, `pivotX/Y`, cell `cx`, `cy`, `tags`, the layer it is on and
every field instance by identifier in `fields`, as exported: points as `{ cx, cy }`, entity references as
`{ entityIid, levelIid, … }`, arrays as arrays.

### Worlds and level files

`project.worlds` holds one world, or several in a multi-worlds project, each with its `layout` and `levels`;
`project.levels` is every level of every world. `worldX`/`worldY` place a level in the world in px; for the
`LinearHorizontal` and `LinearVertical` layouts, which store -1, the levels are laid end to end in their order as LDtk
shows them. `levelAt(levels, x, y, depth?)` finds the level under a world point.

A project saved with "Save levels to separate files" names each level's `.ldtkl` file (`externalRelPath`).
`AssetLoader.ldtk` fetches them all, resolved beside the project; `{ levels: ['Level_0'] }` fetches only those, and the
others stay `loaded: false` (their size, position and fields known, their layers empty) until you fetch one yourself
and read it with `loadLdtkLevel(project, projectJson, level, levelJson)`. Without the loader:

```ts
import { ldtkExternalLevels, parseLdtk } from '1681-engine';

const files = ldtkExternalLevels(json); // the .ldtkl paths, relative to the project
const project = parseLdtk(json, { levels: { 'world/Level_0.ldtkl': level0Json } });
```

### LDtk pitfalls

- **One grid per level.** Every Tiles, AutoLayer and IntGrid layer of a level must share one grid size; a level that
  mixes them is refused, naming the layer. Entity layers may use any grid.
- **Tiles bigger than the layer's grid** are drawn on their cell's bottom-left corner, as Tiled does; LDtk draws them
  on the top-left. Keep the tileset's grid and the layer's equal, or account for it.
- **Off-grid tiles** (an auto-layer rule's random offset) are snapped to the cell their top-left falls in.
- **Not drawn:** IntGrid colours of a layer with no auto-layer rules, the embedded icon atlas (it has no file), level
  backgrounds and per-tile alpha.
- **Entity objects are rectangles.** In the `TileMap` an entity's `x`, `y` is its top-left corner, as for a Tiled
  rectangle; the pivot point LDtk shows is on `level.entities`.

## Autotiling

Autotiling picks each cell's tile from which of its neighbours share its terrain, so a level (or a player digging
through one) only says "wall here, water there" and the borders draw themselves. The rules are pure and run the same
on a server or in a map tool.

```ts
import { autotile, blob47Index, paintTerrain, type AutotileRuleSet } from '1681-engine';

const WATER = 1;
const GRASS = 0;
const rules: AutotileRuleSet = {
  edge: 'same', // terrain running off the map shows no border there
  rules: [
    { terrain: WATER, tiles: (mask) => 16 + blob47Index(mask) }, // a 47-tile blob set laid out in BLOB47_MASKS order
    { terrain: GRASS, mode: 'edges', tiles: { 15: [0, 0, 0, 1, 2] } }, // every grass mask falls back to the full one
  ],
};

const terrain = { width: 40, height: 30, cells: new Uint8Array(40 * 30) }; // terrain ids, row-major
const tiles = autotile(terrain, rules); // a tile id per cell

// later: one cell changed; only it and its eight neighbours are retiled
const changed = paintTerrain(terrain, rules, tiles, x, y, WATER);
for (const i of changed) layer.data[i] = tileset.firstGid + tiles[i]!;
view.refreshTiles(layer.name, changed);
```

Two masks:

- **`edges`** (4 bits, 16 tiles): `EDGE_N` 1, `EDGE_E` 2, `EDGE_S` 4, `EDGE_W` 8, each set when that side's neighbour
  joins. A 16-tile strip in mask order is `tiles: (m) => first + m`. Enough for paths, fences and pipes.
- **`blob`** (8 bits reduced to 47 tiles, the default): the sides plus the corners `BLOB_NE` 2, `BLOB_SE` 8,
  `BLOB_SW` 32, `BLOB_NW` 128 (sides `BLOB_N` 1, `BLOB_E` 4, `BLOB_S` 16, `BLOB_W` 64), a corner counting only when
  both sides beside it join (`reduceBlobMask`). That leaves the 47 masks of `BLOB47_MASKS`, ascending; `blob47Index`
  gives a mask's place among them. A full terrain — outer edges, inner corners, one-tile bridges — needs those 47.

An `AutotileRule` says which `terrain` it draws, its `mode`, and its `tiles`: a function of the mask (and the cell), or
a table by mask whose entry is a tile or a list of variants (one is picked by the cell's position, the same on every
repaint). A mask missing from a table takes `fallback`, else the full mask's entry (15 or 255). `connectsTo` lists
other terrain this one joins as if it were its own (a road meeting a bridge); the link is one way. A terrain no rule
draws gets the set's `empty` tile (default 0). A rule set is read once per object: build a new one to change it.

`edgeMask(grid, x, y, options)` and `blobMask(...)` give a single cell's mask, with `joins` and `edge` as options, for
rules of your own. `updateAutotile(grid, rules, out, x, y)` retiles a cell's neighbourhood after you changed it
yourself; `paintTerrain` sets the cell first. Both return the indices whose tile changed, exactly what
`refreshTiles` takes.

[`examples/ldtk`](/examples#ldtk) loads an LDtk project whose two rooms are saved in their own level files, draws
them side by side by the project's linear layout, walks a hero on the IntGrid's collision and reads the chests'
fields; click a cell to raise or dig out a wall, and it is autotiled again by the same blob rules that baked the file.
