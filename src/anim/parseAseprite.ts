import type { AnimationClip } from './Animator';
import { tagDirection, tagFrames, tagRepeat } from './asepriteTags';
import type {
  AsepriteCue,
  AsepriteFrame,
  AsepriteJson,
  AsepriteJsonFrame,
  AsepriteLayer,
  AsepriteSheet,
  AsepriteSlice,
  AsepriteTag,
  ClipMarker,
} from './asepriteTypes';

// Aseprite's default when a frame has no duration of its own (its "Frame Duration" default)
const DEFAULT_DURATION_MS = 100;

/**
 * Reads Aseprite's exported sprite-sheet JSON — either frame layout, "hash" (frames keyed by file name) or "array" —
 * into frames, one `Animator` clip per tag, slices, layers and cel cues. Pure: no image is touched, so it runs under
 * node and in a worker; `addAsepriteTextures` / `loadAseprite` cut the sheet image by the frames it returns.
 *
 * ```ts
 * const sheet = parseAseprite(json);
 * const anim = new Animator(sheet.clips, 'idle'); // tag names are clip names; frames are sheet frame indices
 * ```
 */
export function parseAseprite(json: unknown): AsepriteSheet {
  if (!json || typeof json !== 'object') throw new Error('parseAseprite: not an Aseprite JSON object');
  const doc = json as AsepriteJson;
  if (!doc.frames || typeof doc.frames !== 'object') throw new Error('parseAseprite: no "frames"');
  const meta = doc.meta ?? {};

  const rawFrames: [string, AsepriteJsonFrame][] = Array.isArray(doc.frames)
    ? doc.frames.map((f, i) => [f.filename ?? String(i), f])
    : Object.entries(doc.frames);
  const frames = rawFrames.map(([name, f], index) => toFrame(name, f, index));
  if (frames.length === 0) throw new Error('parseAseprite: the sheet has no frames');

  const tags: AsepriteTag[] = (meta.frameTags ?? []).map((t) => {
    if (!(t.from >= 0 && t.to < frames.length && t.from <= t.to)) {
      throw new Error(`parseAseprite: tag "${t.name}" spans frames ${t.from}–${t.to} of ${frames.length}`);
    }
    const tag: AsepriteTag = { name: t.name, from: t.from, to: t.to, direction: tagDirection(t.direction), repeat: tagRepeat(t.repeat) };
    if (t.color !== undefined) tag.color = t.color;
    if (t.data !== undefined) tag.data = t.data;
    return tag;
  });

  const clips: Record<string, AnimationClip> = {};
  for (const tag of tags) {
    // Aseprite allows two tags of one name; the second must not silently replace the first
    let name = tag.name;
    for (let n = 2; name in clips; n++) name = `${tag.name}#${n}`;
    clips[name] = clipOf(frames, tagFrames(tag.from, tag.to, tag.direction, tag.repeat), tag.repeat === 0);
  }

  const all = clipOf(frames, frames.map((f) => f.index), true);
  const slices: AsepriteSlice[] = (meta.slices ?? []).map((s) => {
    const slice: AsepriteSlice = {
      name: s.name,
      keys: (s.keys ?? [])
        .map((k) => ({
          frame: k.frame,
          bounds: { ...k.bounds },
          ...(k.center ? { center: { ...k.center } } : {}),
          ...(k.pivot ? { pivot: { ...k.pivot } } : {}),
        }))
        .sort((a, b) => a.frame - b.frame),
    };
    if (s.color !== undefined) slice.color = s.color;
    if (s.data !== undefined) slice.data = s.data;
    return slice;
  });

  const layers: AsepriteLayer[] = [];
  const cues: AsepriteCue[] = [];
  for (const l of meta.layers ?? []) {
    const layer: AsepriteLayer = { name: l.name, opacity: l.opacity ?? 255, blendMode: l.blendMode ?? 'normal' };
    if (l.group !== undefined) layer.group = l.group;
    if (l.color !== undefined) layer.color = l.color;
    if (l.data !== undefined) layer.data = l.data;
    layers.push(layer);
    for (const c of l.cels ?? []) if (c.data) cues.push({ layer: l.name, frame: c.frame, data: c.data });
  }

  const size = meta.size ?? { w: 0, h: 0 };
  return { image: meta.image ?? '', width: size.w, height: size.h, frames, tags, clips, all, slices, layers, cues };
}

function toFrame(name: string, f: AsepriteJsonFrame, index: number): AsepriteFrame {
  if (!f || !f.frame) throw new Error(`parseAseprite: frame "${name}" has no rect`);
  // Aseprite never rotates frames; a packer that did would need its rect read sideways, which nothing here does
  if (f.rotated) throw new Error(`parseAseprite: frame "${name}" is rotated, which is not supported`);
  const { x, y, w, h } = f.frame;
  const src = f.sourceSize ?? { w, h };
  const off = f.trimmed && f.spriteSourceSize ? f.spriteSourceSize : { x: 0, y: 0 };
  return {
    index,
    name,
    rect: { x, y, w, h },
    duration: f.duration !== undefined && f.duration > 0 ? f.duration : DEFAULT_DURATION_MS,
    sourceW: src.w,
    sourceH: src.h,
    offsetX: off.x,
    offsetY: off.y,
    trimmed: f.trimmed === true,
  };
}

function clipOf(frames: readonly AsepriteFrame[], order: readonly number[], loop: boolean): AnimationClip {
  return { frames: order.slice(), durations: order.map((i) => frames[i]!.duration), loop };
}

/** The index of the frame Aseprite named `name`, or -1. */
export function frameNamed(sheet: AsepriteSheet, name: string): number {
  return sheet.frames.findIndex((f) => f.name === name);
}

/**
 * Markers for every clip from the sheet's cel cues: wherever a clip shows a sheet frame whose cel carries user data,
 * a marker of that data at that position of the clip. A ping-pong shows a frame twice a round trip, so it fires twice,
 * as a footstep should. `layer` keeps only the cues of one layer (a layer kept for marks, say "events").
 */
export function clipMarkers(sheet: AsepriteSheet, layer?: string): Record<string, ClipMarker[]> {
  const byFrame = new Map<number, string[]>();
  for (const c of sheet.cues) {
    if (layer !== undefined && c.layer !== layer) continue;
    const list = byFrame.get(c.frame) ?? [];
    list.push(c.data);
    byFrame.set(c.frame, list);
  }
  const out: Record<string, ClipMarker[]> = {};
  for (const [name, clip] of Object.entries(sheet.clips)) {
    const markers: ClipMarker[] = [];
    clip.frames.forEach((f, i) => {
      for (const data of byFrame.get(Number(f)) ?? []) markers.push({ frame: i, name: data });
    });
    if (markers.length) out[name] = markers;
  }
  return out;
}
