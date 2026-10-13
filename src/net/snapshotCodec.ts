import type { EntityUpdate } from './constants';

/** Any snapshot whose `up` block travels as binary records; the rest is JSON. */
export interface SnapshotLike {
  up?: EntityUpdate[];
}

/**
 * Binary wire form of a snapshot's `up` block. A server in another language must write the same bytes.
 *
 * A snapshot that carries no updates is still one text frame of JSON. A snapshot that does is one **binary** WebSocket
 * frame, big-endian throughout:
 *
 * ```
 *   u8   SNAP_FRAME_TAG
 *   u32  L, the byte length of the JSON that follows
 *   L    UTF-8 JSON of the snapshot with `up` left out
 *   n × UPDATE_RECORD_BYTES, one record per EntityUpdate, n = (frame length - 5 - L) / 16
 * ```
 *
 * One record (16 bytes), the `[id, x, y, aim, anim, hp, flags]` tuple:
 *
 * | off | type  | field                                                                              |
 * |-----|-------|------------------------------------------------------------------------------------|
 * | 0   | i32   | id                                                                                 |
 * | 4   | i16   | x in 1/UPDATE_POS_SCALE px, clamped to [-32768, 32767] (−4096 … 4095.875 px)          |
 * | 6   | i16   | y, the same                                                                        |
 * | 8   | u8    | aim in 1/UPDATE_AIM_STEPS of a turn, wrapped; read back in [-π, π)                     |
 * | 9   | u8    | anim (ANIM), clamped to 0..255                                                     |
 * | 10  | i32   | hp (big bodies go past 65535)                                                      |
 * | 14  | u16   | flags (ENTITY_FLAG, nine bits used today), clamped to 0..65535                      |
 *
 * Quantisation error: position ≤ 1/16 px, aim ≤ π/256 rad. The position range holds maps up to 4096 px a side.
 * Each record is written once per actor state version on the server and shared by every viewer.
 */
export const SNAP_FRAME_TAG = 1;
/** Tag byte + the u32 JSON length. */
export const SNAP_FRAME_HEADER_BYTES = 5;
export const UPDATE_RECORD_BYTES = 16;
export const UPDATE_POS_SCALE = 8;
export const UPDATE_AIM_STEPS = 256;

const TURN = Math.PI * 2;

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 0 : v > 0 ? hi : lo;
  const r = Math.round(v);
  return r < lo ? lo : r > hi ? hi : r;
}

/** World px → the i16 on the wire. */
export function quantizePos(v: number): number {
  return clampInt(v * UPDATE_POS_SCALE, -32768, 32767);
}

/** Radians → the u8 on the wire (wrapped, so any angle is accepted). */
export function quantizeAim(a: number): number {
  if (!Number.isFinite(a)) return 0;
  const s = Math.round((a * UPDATE_AIM_STEPS) / TURN);
  return ((s % UPDATE_AIM_STEPS) + UPDATE_AIM_STEPS) % UPDATE_AIM_STEPS;
}

export function dequantizeAim(b: number): number {
  return ((b >= UPDATE_AIM_STEPS / 2 ? b - UPDATE_AIM_STEPS : b) * TURN) / UPDATE_AIM_STEPS;
}

export function writeUpdate(view: DataView, off: number, u: EntityUpdate): void {
  view.setInt32(off, clampInt(u[0], -0x80000000, 0x7fffffff));
  view.setInt16(off + 4, quantizePos(u[1]));
  view.setInt16(off + 6, quantizePos(u[2]));
  view.setUint8(off + 8, quantizeAim(u[3]));
  view.setUint8(off + 9, clampInt(u[4], 0, 255));
  view.setInt32(off + 10, clampInt(u[5], -0x80000000, 0x7fffffff));
  view.setUint16(off + 14, clampInt(u[6], 0, 0xffff));
}

export function readUpdate(view: DataView, off: number): EntityUpdate {
  return [
    view.getInt32(off),
    view.getInt16(off + 4) / UPDATE_POS_SCALE,
    view.getInt16(off + 6) / UPDATE_POS_SCALE,
    dequantizeAim(view.getUint8(off + 8)),
    view.getUint8(off + 9),
    view.getInt32(off + 10),
    view.getUint16(off + 14),
  ];
}

export function encodeUpdates(ups: readonly EntityUpdate[]): Uint8Array {
  const out = new Uint8Array(ups.length * UPDATE_RECORD_BYTES);
  const view = new DataView(out.buffer);
  for (let i = 0; i < ups.length; i++) writeUpdate(view, i * UPDATE_RECORD_BYTES, ups[i]!);
  return out;
}

export function decodeUpdates(bytes: Uint8Array): EntityUpdate[] {
  if (bytes.byteLength % UPDATE_RECORD_BYTES !== 0) throw new Error(`update block of ${bytes.byteLength} bytes`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: EntityUpdate[] = [];
  for (let off = 0; off < bytes.byteLength; off += UPDATE_RECORD_BYTES) out.push(readUpdate(view, off));
  return out;
}

/** The updates exactly as a client reads them off the wire: what a local simulation sends, so it quantises like the server. */
export function quantizeUpdates(ups: readonly EntityUpdate[]): EntityUpdate[] {
  // Same numbers as decodeUpdates(encodeUpdates(ups)) without the byte round trip (`+ 0` turns -0 into 0, as a read does).
  const out: EntityUpdate[] = new Array(ups.length);
  for (let i = 0; i < ups.length; i++) {
    const u = ups[i]!;
    out[i] = [
      clampInt(u[0], -0x80000000, 0x7fffffff) + 0,
      quantizePos(u[1]) / UPDATE_POS_SCALE + 0,
      quantizePos(u[2]) / UPDATE_POS_SCALE + 0,
      dequantizeAim(quantizeAim(u[3])),
      clampInt(u[4], 0, 255) + 0,
      clampInt(u[5], -0x80000000, 0x7fffffff) + 0,
      clampInt(u[6], 0, 0xffff) + 0,
    ];
  }
  return out;
}

interface TextCodecs {
  TextEncoder: new () => { encode(s: string): Uint8Array };
  TextDecoder: new () => { decode(b: Uint8Array): string };
}
// the protocol builds without DOM types; browsers and Node both have these
const text = globalThis as unknown as TextCodecs;
const encoder = new text.TextEncoder();
const decoder = new text.TextDecoder();

/** A snapshot as the server frames it: binary when it carries updates (see the layout above). */
export function encodeSnapshotFrame<S extends SnapshotLike>(snap: S): Uint8Array {
  const { up, ...rest } = snap;
  const json = encoder.encode(JSON.stringify(rest));
  const records = up?.length ? up.length : 0;
  const out = new Uint8Array(SNAP_FRAME_HEADER_BYTES + json.byteLength + records * UPDATE_RECORD_BYTES);
  const view = new DataView(out.buffer);
  view.setUint8(0, SNAP_FRAME_TAG);
  view.setUint32(1, json.byteLength);
  out.set(json, SNAP_FRAME_HEADER_BYTES);
  const base = SNAP_FRAME_HEADER_BYTES + json.byteLength;
  for (let i = 0; i < records; i++) writeUpdate(view, base + i * UPDATE_RECORD_BYTES, up![i]!);
  return out;
}

/** Reads a binary snapshot frame back into the same object a text frame parses to. */
export function decodeSnapshotFrame<S extends SnapshotLike>(frame: ArrayBuffer | Uint8Array): S {
  const bytes = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
  if (bytes.byteLength < SNAP_FRAME_HEADER_BYTES) throw new Error('short snapshot frame');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = view.getUint8(0);
  if (tag !== SNAP_FRAME_TAG) throw new Error(`unknown binary frame tag ${tag}`);
  const len = view.getUint32(1);
  const base = SNAP_FRAME_HEADER_BYTES + len;
  if (base > bytes.byteLength) throw new Error('snapshot frame JSON overruns the frame');
  const snap = JSON.parse(decoder.decode(bytes.subarray(SNAP_FRAME_HEADER_BYTES, base))) as S;
  if (base < bytes.byteLength) snap.up = decodeUpdates(bytes.subarray(base));
  return snap;
}
