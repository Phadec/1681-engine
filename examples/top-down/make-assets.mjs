// Writes the top-down example's assets: a 16-px tileset, a hero sprite sheet (both PNG) and a map in Tiled's JSON
// format, which opens in Tiled (https://www.mapeditor.org) for editing. Run: node examples/top-down/make-assets.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), 'assets');
mkdirSync(out, { recursive: true });

// ── A tiny PNG writer (RGBA, no filtering) ───────────────────────────────────────────────────────────────────────────
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w, h, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = Buffer.alloc(w * h * 4);
  }
  set(x, y, hex) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = (hex >> 16) & 255;
    this.px[i + 1] = (hex >> 8) & 255;
    this.px[i + 2] = hex & 255;
    this.px[i + 3] = 255;
  }
  rect(x, y, w, h, hex) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, hex);
  }
  save(name) {
    writeFileSync(join(out, name), png(this.w, this.h, this.px));
  }
}

// deterministic noise, so the files only change when this script does
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ── Tileset: 8 tiles of 16 px in one row ─────────────────────────────────────────────────────────────────────────────
// 0 grass, 1 grass with tufts, 2 dirt path, 3 stone wall top, 4 stone wall face, 5 water, 6 bush, 7 flowers
const T = 16;
const tiles = new Canvas(T * 8, T);
const GRASS = [0x3f7a3a, 0x4a8a40, 0x356b34];
function grass(ox, tufts) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) tiles.set(ox + x, y, GRASS[rnd() < 0.12 ? 2 : rnd() < 0.2 ? 1 : 0]);
  if (tufts) for (let k = 0; k < 4; k++) {
    const x = ox + 2 + Math.floor(rnd() * 12);
    const y = 3 + Math.floor(rnd() * 11);
    tiles.set(x, y, 0x6aa84f);
    tiles.set(x - 1, y + 1, 0x6aa84f);
    tiles.set(x + 1, y + 1, 0x6aa84f);
  }
}
grass(0, false);
grass(T, true);
for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) tiles.set(2 * T + x, y, rnd() < 0.15 ? 0x8a6a44 : rnd() < 0.1 ? 0xb08e62 : 0x9c7a50);
// wall top: light stone courses, lit from the upper left
tiles.rect(3 * T, 0, T, T, 0x8e8a9a);
for (let y = 0; y < T; y += 4) tiles.rect(3 * T, y, T, 1, 0x6e6a7c);
for (let y = 0; y < T; y += 4) for (let x = (y / 4) % 2 ? 4 : 0; x < T; x += 8) tiles.rect(3 * T + x, y, 1, 4, 0x6e6a7c);
tiles.rect(3 * T, 0, T, 1, 0xb4b0c0);
// wall face: darker, with a shadow at its foot
tiles.rect(4 * T, 0, T, T, 0x5c586c);
for (let y = 3; y < T; y += 5) tiles.rect(4 * T, y, T, 1, 0x48445a);
tiles.rect(4 * T, T - 2, T, 2, 0x2e2a3c);
// water with a few glints
tiles.rect(5 * T, 0, T, T, 0x2e5c8a);
for (let k = 0; k < 6; k++) tiles.rect(5 * T + Math.floor(rnd() * 12), Math.floor(rnd() * 15), 3, 1, 0x5a8cc0);
// bush on grass: a round dark-green mass, lit on its upper left, with a dark outline
grass(6 * T, false);
for (let y = 0; y < T; y++)
  for (let x = 0; x < T; x++) {
    const d = Math.hypot(x - 7.5, y - 8.5);
    if (d < 6.5) tiles.set(6 * T + x, y, d < 6.5 && x + y < 11 ? 0x5fa04a : x + y > 19 ? 0x1f4a26 : 0x2e6a32);
    else if (d < 7.5) tiles.set(6 * T + x, y, 0x14301a);
  }
// flowers on grass
grass(7 * T, false);
for (let k = 0; k < 5; k++) {
  const x = 7 * T + 2 + Math.floor(rnd() * 12);
  const y = 2 + Math.floor(rnd() * 12);
  const c = [0xf0d060, 0xe86a8a, 0xf4f0f0][k % 3];
  tiles.set(x, y, c);
  tiles.set(x + 1, y, c);
  tiles.set(x, y + 1, 0x2e6a32);
}
tiles.save('tiles.png');

// ── Hero: 16×16 frames, idle ×2 then walk ×4, facing right ───────────────────────────────────────────────────────────
const hero = new Canvas(16 * 6, 16);
function body(f, bob, step) {
  const ox = f * 16;
  const OUT = 0x1a1424;
  // legs (alternate on the walk)
  const legA = step === 1 ? -1 : step === 3 ? 1 : 0;
  hero.rect(ox + 6 + legA, 12, 2, 3, 0x3a3048);
  hero.rect(ox + 9 - legA, 12, 2, 3, 0x3a3048);
  // tunic
  hero.rect(ox + 5, 7 + bob, 7, 6, 0x4a6fb0);
  hero.rect(ox + 5, 7 + bob, 7, 1, 0x6a90d0);
  hero.rect(ox + 5, 11 + bob, 7, 1, 0x8a6a44);
  // head
  hero.rect(ox + 5, 2 + bob, 6, 5, 0xf0c8a0);
  hero.rect(ox + 5, 2 + bob, 6, 2, 0x7a4a2a);
  hero.set(ox + 9, 4 + bob, OUT);
  // outline: every empty pixel touching the body
  const solid = (x, y) => hero.px[(y * hero.w + x) * 4 + 3] === 255;
  const ring = [];
  for (let y = 0; y < 16; y++)
    for (let x = ox; x < ox + 16; x++)
      if (!solid(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= ox && x + dx < ox + 16 && y + dy >= 0 && y + dy < 16 && solid(x + dx, y + dy))) ring.push([x, y]);
  for (const [x, y] of ring) hero.set(x, y, OUT);
}
body(0, 0, 0);
body(1, 1, 0);
for (let s = 0; s < 4; s++) body(2 + s, s % 2, s);
hero.save('hero.png');

// ── Map: 40×30, Tiled JSON ───────────────────────────────────────────────────────────────────────────────────────────
const W = 40;
const H = 30;
const ground = new Array(W * H).fill(0);
const objects = new Array(W * H).fill(0);
const gid = (tile) => tile + 1;
for (let i = 0; i < W * H; i++) ground[i] = gid(rnd() < 0.15 ? 1 : 0);
const at = (x, y) => y * W + x;
// a path across and down the middle
for (let x = 0; x < W; x++) ground[at(x, 14)] = ground[at(x, 15)] = gid(2);
for (let y = 0; y < H; y++) ground[at(19, y)] = ground[at(20, y)] = gid(2);
// a pond
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) if (Math.hypot((x - 30) / 1.4, y - 7) < 4) ground[at(x, y)] = gid(5);
// walls round the edge: the top row of each wall is its top, the face below it
for (let x = 0; x < W; x++) {
  objects[at(x, 0)] = gid(3);
  objects[at(x, 1)] = gid(4);
  objects[at(x, H - 1)] = gid(3);
}
for (let y = 0; y < H; y++) {
  objects[at(0, y)] = gid(3);
  objects[at(W - 1, y)] = gid(3);
}
// a ruined house in the south-west
for (let x = 4; x < 14; x++) {
  objects[at(x, 20)] = gid(3);
  objects[at(x, 21)] = gid(4);
}
for (let y = 20; y < 27; y++) objects[at(4, y)] = objects[at(13, y)] = gid(3);
objects[at(8, 20)] = objects[at(9, 20)] = objects[at(8, 21)] = objects[at(9, 21)] = 0;
// bushes and flowers scattered off the paths
for (let k = 0; k < 40; k++) {
  const x = 2 + Math.floor(rnd() * (W - 4));
  const y = 3 + Math.floor(rnd() * (H - 5));
  if (ground[at(x, y)] === gid(2) || ground[at(x, y)] === gid(5) || objects[at(x, y)]) continue;
  if (Math.abs(x - 19.5) < 4 && Math.abs(y - 14.5) < 4) continue;
  objects[at(x, y)] = gid(k % 3 === 0 ? 7 : 6);
}

const map = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.11.0',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  width: W,
  height: H,
  tilewidth: T,
  tileheight: T,
  nextlayerid: 4,
  nextobjectid: 2,
  layers: [
    { id: 1, type: 'tilelayer', name: 'ground', x: 0, y: 0, width: W, height: H, opacity: 1, visible: true, data: ground },
    { id: 2, type: 'tilelayer', name: 'objects', x: 0, y: 0, width: W, height: H, opacity: 1, visible: true, data: objects },
    {
      id: 3,
      type: 'objectgroup',
      name: 'markers',
      opacity: 1,
      visible: true,
      draworder: 'topdown',
      objects: [{ id: 1, name: 'start', type: 'spawn', x: 19.5 * T, y: 13 * T, width: 0, height: 0, rotation: 0, point: true, visible: true }],
    },
  ],
  tilesets: [
    {
      firstgid: 1,
      name: 'tiles',
      image: 'tiles.png',
      imagewidth: T * 8,
      imageheight: T,
      tilewidth: T,
      tileheight: T,
      columns: 8,
      tilecount: 8,
      margin: 0,
      spacing: 0,
      tiles: [3, 4, 5, 6].map((id) => ({ id, properties: [{ name: 'solid', type: 'bool', value: true }] })),
    },
  ],
};
writeFileSync(join(out, 'map.tmj'), JSON.stringify(map));
console.log('wrote', ['tiles.png', 'hero.png', 'map.tmj'].map((f) => join('examples/top-down/assets', f)).join(', '));
