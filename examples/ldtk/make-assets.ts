// Writes the LDtk example's assets: a 16-px tileset (PNG) and a two-level LDtk project whose levels are saved in
// their own `.ldtkl` files. Run: npx tsx examples/ldtk/make-assets.ts
//
// The JSON carries the fields the engine reads, in LDtk's format, not every field the LDtk editor writes; a project
// saved by LDtk itself loads the same way.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { BLOB47_MASKS, BLOB_E, BLOB_N, BLOB_NE, BLOB_NW, BLOB_S, BLOB_SE, BLOB_SW, BLOB_W, autotile } from '../../src/tilemap/autotile';
import { COLUMNS, FLOWER, ROWS, RULES, TILE, WALL } from './rules';

const out = join(dirname(fileURLToPath(import.meta.url)), 'assets');
mkdirSync(join(out, 'dungeon'), { recursive: true });

// ── A tiny PNG writer (RGBA, no filtering) ───────────────────────────────────────────────────────────────────────────
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w: number, h: number, rgba: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ── The tileset ──────────────────────────────────────────────────────────────────────────────────────────────────────
const W = COLUMNS * TILE;
const H = ROWS * TILE;
const px = Buffer.alloc(W * H * 4);
function set(x: number, y: number, hex: number): void {
  const i = (y * W + x) * 4;
  px[i] = (hex >> 16) & 255;
  px[i + 1] = (hex >> 8) & 255;
  px[i + 2] = hex & 255;
  px[i + 3] = 255;
}
const origin = (id: number) => [(id % COLUMNS) * TILE, Math.floor(id / COLUMNS) * TILE] as const;

// a wall tile per blob mask: stone, a dark rim on every open side, a light lip where the floor is to the north, and
// a notch in each inner corner (both sides wall, the diagonal floor)
BLOB47_MASKS.forEach((mask, id) => {
  const [ox, oy] = origin(id);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let c = (x * 7 + y * 13) % 11 === 0 ? 0x544868 : 0x4a4058;
      const open = (bit: number) => (mask & bit) === 0;
      if (open(BLOB_N) && y < 3) c = y === 0 ? 0x221c2c : 0x7a6c8c;
      if (open(BLOB_S) && y > TILE - 3) c = 0x221c2c;
      if (open(BLOB_W) && x < 2) c = 0x221c2c;
      if (open(BLOB_E) && x > TILE - 3) c = 0x221c2c;
      const corner = (bit: number, cx: boolean, cy: boolean) => (mask & bit) === 0 && cx && cy;
      if (corner(BLOB_NW, x < 2, y < 2) || corner(BLOB_NE, x > TILE - 3, y < 2) || corner(BLOB_SW, x < 2, y > TILE - 3) || corner(BLOB_SE, x > TILE - 3, y > TILE - 3)) c = 0x221c2c;
      set(ox + x, oy + y, c);
    }
  }
});
// two floors, then a flower drawn over the floor
for (const [id, seed] of [[47, 3], [48, 5]] as const) {
  const [ox, oy] = origin(id);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) set(ox + x, oy + y, (x * seed + y * 11) % 17 === 0 ? 0x3c4c3a : (x + y) % 2 ? 0x2c3a2e : 0x2e3c30);
}
{
  const [ox, oy] = origin(FLOWER);
  for (const [x, y, c] of [[7, 6, 0xf0c060], [8, 6, 0xf0c060], [7, 7, 0xf0c060], [8, 7, 0xd08030], [7, 8, 0x5a8a4a], [7, 9, 0x5a8a4a], [6, 10, 0x5a8a4a], [8, 10, 0x5a8a4a]] as const) set(ox + x, oy + y, c);
}
writeFileSync(join(out, 'tiles.png'), png(W, H, px));

// ── The levels ───────────────────────────────────────────────────────────────────────────────────────────────────────
const CW = 16;
const CH = 12;

/** A room: walls round the edge, a door gap on `door` side, and whatever `inside` adds. */
function room(door: 'east' | 'west', inside: [number, number][]): Int32Array {
  const cells = new Int32Array(CW * CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (x === 0 || y === 0 || x === CW - 1 || y === CH - 1) cells[y * CW + x] = WALL;
  const dx = door === 'east' ? CW - 1 : 0;
  for (const y of [5, 6]) cells[y * CW + dx] = 0;
  for (const [x, y] of inside) cells[y * CW + x] = WALL;
  return cells;
}

const field = (id: string, type: string, value: unknown) => ({ __identifier: id, __type: type, __value: value, __tile: null, defUid: 0, realEditorValues: [] });

function layer(identifier: string, type: string, extra: object) {
  return { __identifier: identifier, __type: type, __cWid: CW, __cHei: CH, __gridSize: TILE, __opacity: 1, __pxTotalOffsetX: 0, __pxTotalOffsetY: 0, iid: `${identifier}-layer`, visible: true, ...extra };
}

function level(identifier: string, uid: number, cells: Int32Array, flowers: [number, number][], things: object[]) {
  const tiles = autotile({ width: CW, height: CH, cells }, RULES);
  const autoLayerTiles = [...tiles].map((t, i) => ({ px: [(i % CW) * TILE, Math.floor(i / CW) * TILE], src: origin(t), f: 0, t, d: [i], a: 1 }));
  return {
    identifier,
    iid: `level-${uid}`,
    uid,
    worldX: -1,
    worldY: -1,
    worldDepth: 0,
    pxWid: CW * TILE,
    pxHei: CH * TILE,
    __bgColor: '#1b1622',
    fieldInstances: [field('title', 'String', identifier === 'Room_A' ? 'The cellar' : 'The vault')],
    layerInstances: [
      layer('Things', 'Entities', { entityInstances: things }),
      layer('Decor', 'Tiles', { __tilesetDefUid: 1, gridTiles: flowers.map(([x, y]) => ({ px: [x * TILE, y * TILE], src: origin(FLOWER), f: x % 2, t: FLOWER, d: [y * CW + x], a: 1 })) }),
      layer('Walls', 'IntGrid', { __tilesetDefUid: 1, layerDefUid: 10, intGridCsv: [...cells], autoLayerTiles }),
    ],
  };
}

const entity = (identifier: string, cx: number, cy: number, fields: object[]) => ({
  __identifier: identifier,
  __grid: [cx, cy],
  __pivot: [0.5, 1],
  __tags: [],
  iid: `${identifier}-${cx}-${cy}`,
  width: TILE,
  height: TILE,
  px: [cx * TILE + TILE / 2, (cy + 1) * TILE],
  fieldInstances: fields,
});

const levels = [
  level('Room_A', 0, room('east', [[4, 3], [4, 4], [5, 3], [10, 7], [10, 8], [11, 8]]), [[3, 8], [12, 3], [7, 9]], [entity('Player', 3, 6, []), entity('Chest', 12, 2, [field('gold', 'Int', 25), field('note', 'String', 'Spare change')])]),
  level('Room_B', 1, room('west', [[5, 2], [5, 3], [5, 4], [5, 7], [5, 8], [5, 9], [9, 4], [10, 4], [11, 4], [12, 4]]), [[2, 9], [13, 9]], [entity('Chest', 13, 2, [field('gold', 'Int', 300), field('note', 'String', 'The vault')])]),
];

const project = {
  __header__: { fileType: 'LDtk Project JSON', app: 'LDtk', appAuthor: 'Sebastien Benard', appVersion: '1.5.3', url: 'https://ldtk.io' },
  jsonVersion: '1.5.3',
  iid: 'example-ldtk',
  defaultGridSize: TILE,
  bgColor: '#1b1622',
  worldLayout: 'LinearHorizontal',
  worldGridWidth: CW * TILE,
  worldGridHeight: CH * TILE,
  externalLevels: true,
  defs: {
    layers: [
      { __type: 'IntGrid', identifier: 'Walls', type: 'IntGrid', uid: 10, gridSize: TILE, intGridValues: [{ value: WALL, identifier: 'wall', color: '#4A4058' }] },
      { __type: 'Tiles', identifier: 'Decor', type: 'Tiles', uid: 11, gridSize: TILE },
      { __type: 'Entities', identifier: 'Things', type: 'Entities', uid: 12, gridSize: TILE },
    ],
    entities: [
      { identifier: 'Player', uid: 20, width: TILE, height: TILE, pivotX: 0.5, pivotY: 1 },
      { identifier: 'Chest', uid: 21, width: TILE, height: TILE, pivotX: 0.5, pivotY: 1 },
    ],
    tilesets: [{ uid: 1, identifier: 'Dungeon', relPath: 'tiles.png', pxWid: W, pxHei: H, tileGridSize: TILE, spacing: 0, padding: 0, __cWid: COLUMNS, __cHei: ROWS, customData: [], enumTags: [] }],
    enums: [],
    externalEnums: [],
    levelFields: [],
  },
  levels: levels.map(({ layerInstances: _drop, ...l }) => ({ ...l, layerInstances: null, externalRelPath: `dungeon/${l.identifier}.ldtkl` })),
  worlds: [],
};

writeFileSync(join(out, 'dungeon.ldtk'), JSON.stringify(project));
for (const l of levels) writeFileSync(join(out, 'dungeon', `${l.identifier}.ldtkl`), JSON.stringify(l));
console.log(`wrote tiles.png, dungeon.ldtk and ${levels.length} level files into ${out}`);
