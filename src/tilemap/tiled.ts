/**
 * Maps made in Tiled (https://www.mapeditor.org), read from its JSON format (`.tmj`, or `.json`). Supported:
 * orthogonal, finite maps; tile layers as CSV arrays or uncompressed base64; object layers; group layers (flattened);
 * custom properties; flipped tiles. Not supported (refused with a message saying so): infinite maps, compressed layer
 * data, isometric and hexagonal maps, external `.tsj` tilesets (embed them: Map → Embed Tilesets).
 *
 * Pure: no Pixi, no DOM, so a server can read the same map for collision.
 */

/** The three flags Tiled keeps in a gid's high bits; the rest is the tile id. */
export const FLIP_H = 0x80000000;
export const FLIP_V = 0x40000000;
export const FLIP_D = 0x20000000;
const GID_MASK = 0x1fffffff;

export type TiledPropertyValue = string | number | boolean;
export type Properties = Record<string, TiledPropertyValue>;

export interface TileLayer {
  kind: 'tiles';
  name: string;
  /** Row-major gids (0 = empty), flip flags kept. Read the tile id with `gidOf`. */
  data: Uint32Array;
  visible: boolean;
  opacity: number;
  offsetX: number;
  offsetY: number;
  properties: Properties;
}

export interface MapObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** A tile object's gid, if it is one. */
  gid?: number;
  point: boolean;
  ellipse: boolean;
  polygon?: { x: number; y: number }[];
  properties: Properties;
}

export interface ObjectLayer {
  kind: 'objects';
  name: string;
  objects: MapObject[];
  visible: boolean;
  properties: Properties;
}

export type MapLayer = TileLayer | ObjectLayer;

export interface Tileset {
  name: string;
  firstGid: number;
  /** The image's path as written in the map, relative to the map file. */
  image: string;
  imageWidth: number;
  imageHeight: number;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  tileCount: number;
  margin: number;
  spacing: number;
  /** Per local tile id: its custom properties. */
  tileProperties: Map<number, Properties>;
  /** Per local tile id: an animation (local tile ids and how long each shows, ms). */
  animations: Map<number, { tileId: number; duration: number }[]>;
  properties: Properties;
}

export interface TileMap {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  layers: MapLayer[];
  tilesets: Tileset[];
  properties: Properties;
  backgroundColor?: string;
}

/** The tile id of a gid, without its flip flags. */
export const gidOf = (raw: number): number => raw & GID_MASK;

/** Which tileset a gid belongs to, and the tile's id inside it; null for an empty cell or an unknown gid. */
export function tileAt(map: TileMap, raw: number): { tileset: Tileset; local: number } | null {
  const gid = gidOf(raw);
  if (gid === 0) return null;
  let found: Tileset | null = null;
  for (const ts of map.tilesets) if (ts.firstGid <= gid && (!found || ts.firstGid > found.firstGid)) found = ts;
  if (!found || gid - found.firstGid >= found.tileCount) return null;
  return { tileset: found, local: gid - found.firstGid };
}

/** Where tile `local` sits in its tileset image. */
export function tileRect(ts: Tileset, local: number): { x: number; y: number; w: number; h: number } {
  const col = local % ts.columns;
  const row = Math.floor(local / ts.columns);
  return { x: ts.margin + col * (ts.tileWidth + ts.spacing), y: ts.margin + row * (ts.tileHeight + ts.spacing), w: ts.tileWidth, h: ts.tileHeight };
}

export function layerByName(map: TileMap, name: string): MapLayer | undefined {
  return map.layers.find((l) => l.name === name);
}

/** Every object of every object layer (optionally only those of one `type`/class). */
export function objectsOf(map: TileMap, type?: string): MapObject[] {
  const out: MapObject[] = [];
  for (const l of map.layers) if (l.kind === 'objects') for (const o of l.objects) if (type === undefined || o.type === type) out.push(o);
  return out;
}

// ── Parsing ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any -- the input is untrusted JSON, checked field by field below */
type Json = any;

class TiledError extends Error {
  constructor(message: string) {
    super(`Tiled map: ${message}`);
  }
}

function props(list: Json): Properties {
  const out: Properties = {};
  if (!Array.isArray(list)) return out;
  for (const p of list) if (p && typeof p.name === 'string' && ['string', 'number', 'boolean'].includes(typeof p.value)) out[p.name] = p.value;
  return out;
}

function num(v: Json, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TiledError(`${what} must be a number`);
  return v;
}

function decodeBase64(text: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(text.trim());
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array((globalThis as Json).Buffer.from(text, 'base64'));
}

function layerData(l: Json, cells: number): Uint32Array {
  if (l.compression) throw new TiledError(`layer "${l.name}" is ${l.compression}-compressed; save it as CSV or uncompressed base64`);
  let data: Uint32Array;
  if (l.encoding === 'base64') {
    const bytes = decodeBase64(String(l.data));
    if (bytes.length !== cells * 4) throw new TiledError(`layer "${l.name}" holds ${bytes.length / 4} cells, not ${cells}`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    data = new Uint32Array(cells);
    for (let i = 0; i < cells; i++) data[i] = view.getUint32(i * 4, true);
  } else {
    if (!Array.isArray(l.data) || l.data.length !== cells) throw new TiledError(`layer "${l.name}" must hold ${cells} cells`);
    data = Uint32Array.from(l.data as number[]);
  }
  return data;
}

function parseObject(o: Json): MapObject {
  const obj: MapObject = {
    id: num(o.id, 'object id'),
    name: String(o.name ?? ''),
    type: String(o.type ?? o.class ?? ''),
    x: num(o.x, 'object x'),
    y: num(o.y, 'object y'),
    width: Number(o.width ?? 0),
    height: Number(o.height ?? 0),
    rotation: Number(o.rotation ?? 0),
    point: o.point === true,
    ellipse: o.ellipse === true,
    properties: props(o.properties),
  };
  if (typeof o.gid === 'number') obj.gid = o.gid;
  if (Array.isArray(o.polygon)) obj.polygon = o.polygon.map((p: Json) => ({ x: num(p.x, 'polygon x'), y: num(p.y, 'polygon y') }));
  return obj;
}

function parseLayers(list: Json, map: { width: number; height: number }, out: MapLayer[], parent = { visible: true, opacity: 1, x: 0, y: 0 }): void {
  if (!Array.isArray(list)) return;
  for (const l of list) {
    const visible = parent.visible && l.visible !== false;
    const opacity = parent.opacity * (typeof l.opacity === 'number' ? l.opacity : 1);
    const offsetX = parent.x + Number(l.offsetx ?? 0);
    const offsetY = parent.y + Number(l.offsety ?? 0);
    if (l.type === 'tilelayer') {
      out.push({ kind: 'tiles', name: String(l.name ?? ''), data: layerData(l, map.width * map.height), visible, opacity, offsetX, offsetY, properties: props(l.properties) });
    } else if (l.type === 'objectgroup') {
      out.push({ kind: 'objects', name: String(l.name ?? ''), objects: (l.objects ?? []).map(parseObject), visible, properties: props(l.properties) });
    } else if (l.type === 'group') {
      parseLayers(l.layers, map, out, { visible, opacity, x: offsetX, y: offsetY });
    }
    // image layers are ignored: draw backgrounds yourself
  }
}

function parseTileset(t: Json): Tileset {
  if (typeof t.source === 'string') throw new TiledError(`tileset "${t.source}" is external; embed it in the map (Map → Embed Tilesets)`);
  if (typeof t.image !== 'string') throw new TiledError(`tileset "${t.name}" is a collection of images; use a single-image tileset`);
  const tileProperties = new Map<number, Properties>();
  const animations = new Map<number, { tileId: number; duration: number }[]>();
  for (const tile of t.tiles ?? []) {
    const id = num(tile.id, 'tile id');
    if (tile.properties) tileProperties.set(id, props(tile.properties));
    if (Array.isArray(tile.animation)) animations.set(id, tile.animation.map((f: Json) => ({ tileId: num(f.tileid, 'animation tileid'), duration: num(f.duration, 'animation duration') })));
  }
  return {
    name: String(t.name ?? ''),
    firstGid: num(t.firstgid, 'tileset firstgid'),
    image: t.image,
    imageWidth: num(t.imagewidth, 'tileset imagewidth'),
    imageHeight: num(t.imageheight, 'tileset imageheight'),
    tileWidth: num(t.tilewidth, 'tileset tilewidth'),
    tileHeight: num(t.tileheight, 'tileset tileheight'),
    columns: num(t.columns, 'tileset columns'),
    tileCount: num(t.tilecount, 'tileset tilecount'),
    margin: Number(t.margin ?? 0),
    spacing: Number(t.spacing ?? 0),
    tileProperties,
    animations,
    properties: props(t.properties),
  };
}

/** Reads a Tiled JSON map (already parsed with `JSON.parse`). Throws a `Tiled map: …` error saying what is wrong. */
export function parseTiled(json: unknown): TileMap {
  const m = json as Json;
  if (!m || typeof m !== 'object') throw new TiledError('not a JSON object');
  if (m.infinite) throw new TiledError('infinite maps are not supported; uncheck Map → Map Properties → Infinite');
  if (m.orientation && m.orientation !== 'orthogonal') throw new TiledError(`${m.orientation} maps are not supported, only orthogonal`);
  const width = num(m.width, 'width');
  const height = num(m.height, 'height');
  const layers: MapLayer[] = [];
  parseLayers(m.layers, { width, height }, layers);
  const map: TileMap = {
    width,
    height,
    tileWidth: num(m.tilewidth, 'tilewidth'),
    tileHeight: num(m.tileheight, 'tileheight'),
    layers,
    tilesets: (m.tilesets ?? []).map(parseTileset),
    properties: props(m.properties),
  };
  if (typeof m.backgroundcolor === 'string') map.backgroundColor = m.backgroundcolor;
  return map;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
