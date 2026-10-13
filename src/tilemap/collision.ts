import { createCollisionGrid, type CollisionGrid, type CollisionGridOptions } from '../net/movement';
import { gidOf, tileAt, type TileMap } from './tiled';

export interface TiledCollisionOptions extends Omit<CollisionGridOptions, 'ground'> {
  /**
   * What makes a cell solid:
   * - a layer name: every non-empty cell of that tile layer is solid (a hidden "collision" layer is the usual way);
   * - `{ property }`: a cell is solid when its tile has that custom property set to true, on any tile layer.
   * Default: the layer named "collision" if there is one, else tiles with a `solid` property.
   */
  solid?: string | { property: string };
}

/** The `CollisionGrid` of a Tiled map, for `stepMover`; cells are the map's tiles. */
export function collisionFromTiled(map: TileMap, options: TiledCollisionOptions = {}): CollisionGrid {
  if (map.tileWidth !== map.tileHeight) throw new Error(`Tiled map: collision needs square tiles, not ${map.tileWidth}x${map.tileHeight}`);
  const rule = options.solid ?? (map.layers.some((l) => l.kind === 'tiles' && l.name === 'collision') ? 'collision' : { property: 'solid' });
  const cells = map.width * map.height;
  const solid = new Uint8Array(cells);
  if (typeof rule === 'string') {
    const layer = map.layers.find((l) => l.kind === 'tiles' && l.name === rule);
    if (!layer || layer.kind !== 'tiles') throw new Error(`Tiled map: no tile layer named "${rule}"`);
    for (let i = 0; i < cells; i++) if (gidOf(layer.data[i]!) !== 0) solid[i] = 1;
  } else {
    for (const layer of map.layers) {
      if (layer.kind !== 'tiles') continue;
      for (let i = 0; i < cells; i++) {
        const t = tileAt(map, layer.data[i]!);
        if (t && t.tileset.tileProperties.get(t.local)?.[rule.property] === true) solid[i] = 1;
      }
    }
  }
  let s = '';
  for (let i = 0; i < cells; i++) s += solid[i] ? '1' : '0';
  const { solid: _rule, ...gridOptions } = options;
  return createCollisionGrid(map.width, map.height, map.tileWidth, s, gridOptions);
}
