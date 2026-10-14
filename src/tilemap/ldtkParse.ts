/**
 * The LDtk reader: a project's JSON (and its `.ldtkl` level files, when it saves levels apart) into `LdtkProject`.
 * Supported: IntGrid, AutoLayer, Tiles and Entities layers; tilesets with an image; tile custom data and enum tags
 * (as tile properties); entity and level fields; Free, GridVania and Linear world layouts; multi-worlds projects.
 * Not drawn: the IntGrid colours of a layer with no tileset, the embedded icon atlas, level backgrounds.
 *
 * Pure: no Pixi, no DOM.
 */
import type { LdtkEntity, LdtkFieldValue, LdtkIntGrid, LdtkLevel, LdtkProject, LdtkWorld, LdtkWorldLayout } from './ldtk';
import { FLIP_H, FLIP_V, type MapLayer, type MapObject, type Properties, type TileLayer, type Tileset } from './tiled';

/* eslint-disable @typescript-eslint/no-explicit-any -- the input is untrusted JSON, checked field by field below */
type Json = any;

class LdtkError extends Error {
  constructor(message: string) {
    super(`LDtk project: ${message}`);
  }
}

function num(v: Json, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new LdtkError(`${what} must be a number`);
  return v;
}

function fieldsOf(list: Json): Record<string, LdtkFieldValue> {
  const out: Record<string, LdtkFieldValue> = {};
  if (Array.isArray(list)) for (const f of list) if (f && typeof f.__identifier === 'string') out[f.__identifier] = f.__value ?? null;
  return out;
}

/** The scalar fields, which are all a Tiled-style `Properties` can hold; the rest stays on the entity's `fields`. */
function scalarProps(fields: Record<string, LdtkFieldValue>): Properties {
  const out: Properties = {};
  for (const [k, v] of Object.entries(fields)) if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  return out;
}

/** The levels of every world: the old single-world layout keeps them at the top, multi-worlds in `worlds`. */
function worldsJson(p: Json): Json[] {
  if (Array.isArray(p.worlds) && p.worlds.length) return p.worlds;
  return [{ identifier: 'World', iid: '', worldLayout: p.worldLayout, worldGridWidth: p.worldGridWidth, worldGridHeight: p.worldGridHeight, levels: p.levels ?? [] }];
}

/** The `.ldtkl` files a project saves its levels in, relative to the project file; empty when levels are inline. */
export function ldtkExternalLevels(json: unknown): string[] {
  const p = json as Json;
  if (!p || typeof p !== 'object') return [];
  const out: string[] = [];
  for (const w of worldsJson(p)) for (const l of w.levels ?? []) if (typeof l.externalRelPath === 'string' && !Array.isArray(l.layerInstances)) out.push(l.externalRelPath);
  return out;
}

function parseTilesets(defs: Json): { tilesets: Tileset[]; byUid: Map<number, Tileset> } {
  const tilesets: Tileset[] = [];
  const byUid = new Map<number, Tileset>();
  let firstGid = 1;
  for (const t of defs?.tilesets ?? []) {
    // the embedded icon atlas and tilesets whose image was removed have no file to load
    if (typeof t.relPath !== 'string') continue;
    const grid = num(t.tileGridSize, `tileset "${t.identifier}" tileGridSize`);
    const columns = num(t.__cWid, `tileset "${t.identifier}" __cWid`);
    const tileCount = columns * num(t.__cHei, `tileset "${t.identifier}" __cHei`);
    const tileProperties = new Map<number, Properties>();
    const propsOf = (id: number) => tileProperties.get(id) ?? (tileProperties.set(id, {}), tileProperties.get(id)!);
    for (const d of t.customData ?? []) if (typeof d.tileId === 'number' && typeof d.data === 'string') propsOf(d.tileId).data = d.data;
    // an enum tag reads like a Tiled boolean property, so `collisionFromTiled({ solid: { property: 'Wall' } })` works
    for (const e of t.enumTags ?? []) for (const id of e.tileIds ?? []) if (typeof e.enumValueId === 'string') propsOf(id)[e.enumValueId] = true;
    const ts: Tileset = {
      name: String(t.identifier ?? `tileset${t.uid}`),
      firstGid,
      image: t.relPath,
      imageWidth: num(t.pxWid, `tileset "${t.identifier}" pxWid`),
      imageHeight: num(t.pxHei, `tileset "${t.identifier}" pxHei`),
      tileWidth: grid,
      tileHeight: grid,
      columns,
      tileCount,
      margin: Number(t.padding ?? 0),
      spacing: Number(t.spacing ?? 0),
      tileProperties,
      animations: new Map(),
      properties: {},
    };
    tilesets.push(ts);
    byUid.set(num(t.uid, 'tileset uid'), ts);
    firstGid += tileCount;
  }
  return { tilesets, byUid };
}

/** Tiles into one or more `TileLayer`s: a cell holding a second tile spills into a layer drawn over the first. */
function tileLayers(li: Json, name: string, tiles: Json[], ts: Tileset, w: number, h: number, grid: number): TileLayer[] {
  const out: TileLayer[] = [];
  const layerFor = (depth: number): TileLayer => {
    while (out.length <= depth) {
      out.push({
        kind: 'tiles',
        name: out.length ? `${name}#${out.length}` : name,
        data: new Uint32Array(w * h),
        visible: li.visible !== false,
        opacity: typeof li.__opacity === 'number' ? li.__opacity : 1,
        offsetX: Number(li.__pxTotalOffsetX ?? 0),
        offsetY: Number(li.__pxTotalOffsetY ?? 0),
        properties: {},
      });
    }
    return out[depth]!;
  };
  // tiles come in draw order (each over the ones before), so the n-th tile of a cell goes on the n-th layer
  const filled = new Uint8Array(w * h);
  for (const t of tiles) {
    const cx = Math.floor(num(t.px?.[0], `layer "${name}" tile px`) / grid);
    const cy = Math.floor(num(t.px?.[1], `layer "${name}" tile px`) / grid);
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const id = num(t.t, `layer "${name}" tile id`);
    if (id < 0 || id >= ts.tileCount) continue;
    const i = cy * w + cx;
    const f = Number(t.f ?? 0);
    const gid = ((ts.firstGid + id) | (f & 1 ? FLIP_H : 0) | (f & 2 ? FLIP_V : 0)) >>> 0;
    layerFor(filled[i]!).data[i] = gid;
    filled[i] = Math.min(255, filled[i]! + 1);
  }
  if (!out.length) layerFor(0);
  return out;
}

function intGridNames(defs: Json, layerDefUid: number): Map<number, string> {
  const names = new Map<number, string>();
  const def = (defs?.layers ?? []).find((d: Json) => d.uid === layerDefUid);
  for (const v of def?.intGridValues ?? []) if (typeof v.value === 'number' && typeof v.identifier === 'string' && v.identifier) names.set(v.value, v.identifier);
  return names;
}

function parseLevelLayers(level: LdtkLevel, list: Json[], defs: Json, byUid: Map<number, Tileset>, defaultGrid: number): void {
  // the map's grid is the tile layers' grid; entities may sit on any grid of their own
  const gridLayers = list.filter((li) => li.__type !== 'Entities');
  const grid = gridLayers.length ? num(gridLayers[0].__gridSize, 'layer __gridSize') : defaultGrid;
  for (const li of gridLayers) {
    if (li.__gridSize !== grid) throw new LdtkError(`level "${level.identifier}" layer "${li.__identifier}" has a ${li.__gridSize} px grid, not ${grid}: every tile and IntGrid layer of a level must share one grid`);
  }
  const w = gridLayers.length ? Math.max(...gridLayers.map((li) => num(li.__cWid, 'layer __cWid'))) : Math.ceil(level.pxWidth / grid);
  const h = gridLayers.length ? Math.max(...gridLayers.map((li) => num(li.__cHei, 'layer __cHei'))) : Math.ceil(level.pxHeight / grid);
  const layers: MapLayer[] = [];
  let objectId = 1;
  // LDtk lists its layers top first; a TileMap draws its first layer at the bottom
  for (const li of [...list].reverse()) {
    const name = String(li.__identifier ?? '');
    const type = li.__type;
    const offsetX = Number(li.__pxTotalOffsetX ?? 0);
    const offsetY = Number(li.__pxTotalOffsetY ?? 0);
    if (type === 'IntGrid') {
      const cw = num(li.__cWid, 'layer __cWid');
      const ch = num(li.__cHei, 'layer __cHei');
      const csv = li.intGridCsv;
      if (!Array.isArray(csv) || csv.length !== cw * ch) throw new LdtkError(`layer "${name}" must hold ${cw * ch} IntGrid cells`);
      const g: LdtkIntGrid = { name, width: cw, height: ch, gridSize: grid, values: Int32Array.from(csv as number[]), names: intGridNames(defs, li.layerDefUid), offsetX, offsetY };
      level.intGrids.set(name, g);
    }
    if (type === 'IntGrid' || type === 'AutoLayer' || type === 'Tiles') {
      const tiles: Json[] = type === 'Tiles' ? li.gridTiles ?? [] : li.autoLayerTiles ?? [];
      const uid = li.overrideTilesetUid ?? li.__tilesetDefUid;
      const ts = typeof uid === 'number' ? byUid.get(uid) : undefined;
      // an IntGrid with no auto-layer rules has nothing to draw, and neither has a layer whose tileset has no image
      if (ts && (type !== 'IntGrid' || tiles.length)) layers.push(...tileLayers(li, name, tiles, ts, w, h, grid));
    } else if (type === 'Entities') {
      const objects: MapObject[] = [];
      for (const e of li.entityInstances ?? []) {
        const fields = fieldsOf(e.fieldInstances);
        const width = Number(e.width ?? 0);
        const height = Number(e.height ?? 0);
        const pivotX = Number(e.__pivot?.[0] ?? 0);
        const pivotY = Number(e.__pivot?.[1] ?? 0);
        const x = num(e.px?.[0], `entity "${e.__identifier}" px`) + offsetX;
        const y = num(e.px?.[1], `entity "${e.__identifier}" px`) + offsetY;
        const entity: LdtkEntity = {
          iid: String(e.iid ?? ''),
          identifier: String(e.__identifier ?? ''),
          x,
          y,
          width,
          height,
          pivotX,
          pivotY,
          cx: Number(e.__grid?.[0] ?? Math.floor(x / grid)),
          cy: Number(e.__grid?.[1] ?? Math.floor(y / grid)),
          tags: Array.isArray(e.__tags) ? e.__tags.map(String) : [],
          fields,
          layer: name,
        };
        level.entities.push(entity);
        // as a Tiled rectangle: x, y is the top-left corner
        objects.push({ id: objectId++, name: entity.identifier, type: entity.identifier, x: x - pivotX * width, y: y - pivotY * height, width, height, rotation: 0, point: width === 0 && height === 0, ellipse: false, properties: scalarProps(fields) });
      }
      layers.push({ kind: 'objects', name, objects, visible: li.visible !== false, properties: {} });
    }
  }
  level.map.width = w;
  level.map.height = h;
  level.map.tileWidth = grid;
  level.map.tileHeight = grid;
  level.map.layers = layers;
}

function parseLevel(l: Json, project: LdtkProject, defs: Json, byUid: Map<number, Tileset>, external: (relPath: string) => unknown): LdtkLevel {
  const identifier = String(l.identifier ?? '');
  const bgColor = String(l.__bgColor ?? l.bgColor ?? project.bgColor);
  const level: LdtkLevel = {
    identifier,
    iid: String(l.iid ?? ''),
    uid: Number(l.uid ?? 0),
    worldX: Number(l.worldX ?? 0),
    worldY: Number(l.worldY ?? 0),
    worldDepth: Number(l.worldDepth ?? 0),
    pxWidth: num(l.pxWid, `level "${identifier}" pxWid`),
    pxHeight: num(l.pxHei, `level "${identifier}" pxHei`),
    bgColor,
    fields: fieldsOf(l.fieldInstances),
    map: { width: 0, height: 0, tileWidth: project.defaultGridSize, tileHeight: project.defaultGridSize, layers: [], tilesets: project.tilesets, properties: {}, backgroundColor: bgColor },
    intGrids: new Map(),
    entities: [],
    loaded: false,
  };
  if (typeof l.externalRelPath === 'string') level.externalRelPath = l.externalRelPath;
  let source = l;
  if (!Array.isArray(l.layerInstances) && level.externalRelPath) source = external(level.externalRelPath) as Json;
  if (source && Array.isArray(source.layerInstances)) {
    level.fields = { ...level.fields, ...fieldsOf(source.fieldInstances) };
    level.map.properties = scalarProps(level.fields);
    parseLevelLayers(level, source.layerInstances, defs, byUid, project.defaultGridSize);
    level.loaded = true;
  }
  return level;
}

/** The `Linear*` layouts store -1 for every position: lay the levels end to end in their order, as LDtk shows them. */
function placeLinear(levels: LdtkLevel[], layout: LdtkWorldLayout): void {
  let at = 0;
  for (const l of levels) {
    if (layout === 'LinearHorizontal') {
      l.worldX = at;
      l.worldY = 0;
      at += l.pxWidth;
    } else {
      l.worldX = 0;
      l.worldY = at;
      at += l.pxHeight;
    }
  }
}

export interface LdtkParseOptions {
  /**
   * The parsed JSON of each external level file, by the `externalRelPath` the project names it with
   * (`ldtkExternalLevels` lists them). A level left out stays `loaded: false`, so levels can be streamed in later.
   */
  levels?: Record<string, unknown> | ((relPath: string) => unknown);
}

/** Reads an LDtk project (already `JSON.parse`d). Throws an `LDtk project: …` error saying what is wrong. */
export function parseLdtk(json: unknown, options: LdtkParseOptions = {}): LdtkProject {
  const p = json as Json;
  if (!p || typeof p !== 'object' || !p.defs) throw new LdtkError('not an LDtk project (no "defs")');
  const given = options.levels;
  const external = typeof given === 'function' ? given : (rel: string) => given?.[rel];
  const { tilesets, byUid } = parseTilesets(p.defs);
  const project: LdtkProject = {
    jsonVersion: String(p.jsonVersion ?? ''),
    defaultGridSize: Number(p.defaultGridSize ?? 16),
    bgColor: String(p.bgColor ?? '#000000'),
    tilesets,
    worlds: [],
    levels: [],
  };
  for (const w of worldsJson(p)) {
    const layout: LdtkWorldLayout = w.worldLayout ?? 'Free';
    const world: LdtkWorld = {
      identifier: String(w.identifier ?? ''),
      iid: String(w.iid ?? ''),
      layout,
      gridWidth: Number(w.worldGridWidth ?? 0),
      gridHeight: Number(w.worldGridHeight ?? 0),
      levels: (w.levels ?? []).map((l: Json) => parseLevel(l, project, p.defs, byUid, external)),
    };
    if (layout === 'LinearHorizontal' || layout === 'LinearVertical') placeLinear(world.levels, layout);
    project.worlds.push(world);
    project.levels.push(...world.levels);
  }
  return project;
}

/**
 * Reads one external level file into a level `parseLdtk` left unloaded (`loaded: false`), for projects that stream
 * their levels. Returns the same level, now loaded.
 */
export function loadLdtkLevel(project: LdtkProject, projectJson: unknown, level: LdtkLevel, levelJson: unknown): LdtkLevel {
  const p = projectJson as Json;
  const { byUid } = parseTilesets(p?.defs);
  const filled = parseLevel({ ...(levelJson as Json), worldX: level.worldX, worldY: level.worldY, externalRelPath: level.externalRelPath }, project, p?.defs, byUid, () => undefined);
  Object.assign(level, { map: filled.map, intGrids: filled.intGrids, entities: filled.entities, fields: filled.fields, loaded: filled.loaded });
  return level;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
