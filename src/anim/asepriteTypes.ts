import type { AnimationClip } from './Animator';

/*
 * The shapes of Aseprite's exported sprite-sheet JSON (File → Export Sprite Sheet, "JSON Data"), in both of its frame
 * layouts, and what `parseAseprite` makes of them. Only the fields the engine reads are typed; Aseprite writes more.
 */

export interface AsepriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One frame as Aseprite writes it. */
export interface AsepriteJsonFrame {
  /** Only in the "array" layout; the "hash" layout keys the frame by it instead. */
  filename?: string;
  frame: AsepriteRect;
  rotated?: boolean;
  trimmed?: boolean;
  spriteSourceSize?: AsepriteRect;
  sourceSize?: { w: number; h: number };
  /** Milliseconds. */
  duration?: number;
}

export interface AsepriteJsonTag {
  name: string;
  from: number;
  to: number;
  direction?: string;
  /** A count as a string ("3"); absent means forever. Aseprite 1.3 and later. */
  repeat?: string | number;
  color?: string;
  data?: string;
}

export interface AsepriteJsonSliceKey {
  frame: number;
  bounds: AsepriteRect;
  center?: AsepriteRect;
  pivot?: { x: number; y: number };
}

export interface AsepriteJsonSlice {
  name: string;
  color?: string;
  data?: string;
  keys: AsepriteJsonSliceKey[];
}

export interface AsepriteJsonLayer {
  name: string;
  group?: string;
  opacity?: number;
  blendMode?: string;
  color?: string;
  data?: string;
  /** Cels carrying user data or a colour, when the export includes them. */
  cels?: { frame: number; data?: string; color?: string }[];
}

export interface AsepriteJson {
  frames: AsepriteJsonFrame[] | Record<string, AsepriteJsonFrame>;
  meta: {
    app?: string;
    version?: string;
    image?: string;
    format?: string;
    size?: { w: number; h: number };
    scale?: string;
    frameTags?: AsepriteJsonTag[];
    layers?: AsepriteJsonLayer[];
    slices?: AsepriteJsonSlice[];
  };
}

// ── What the parser returns ─────────────────────────────────────────────────────────────────────────────────────

export type AsepriteDirection = 'forward' | 'reverse' | 'pingpong' | 'pingpong_reverse';

/** A frame of the sheet, by its index (the texture frame's name is that index as a string). */
export interface AsepriteFrame {
  index: number;
  /** Aseprite's file name for the frame ("hero 3.aseprite"); look a frame up by it with `frameNamed`. */
  name: string;
  /** Where it lies on the sheet image. */
  rect: AsepriteRect;
  /** Milliseconds. */
  duration: number;
  /** The untrimmed size of the sprite. */
  sourceW: number;
  sourceH: number;
  /** Where the trimmed rect sits inside the untrimmed sprite (0, 0 when not trimmed). */
  offsetX: number;
  offsetY: number;
  trimmed: boolean;
}

export interface AsepriteTag {
  name: string;
  from: number;
  to: number;
  direction: AsepriteDirection;
  /** Passes to play; 0 is forever. */
  repeat: number;
  color?: string;
  data?: string;
}

export interface AsepriteSliceKey {
  /** The key holds from this frame until the next key's frame. */
  frame: number;
  bounds: AsepriteRect;
  /** The 9-slice centre, in the slice's own coordinates. */
  center?: AsepriteRect;
  pivot?: { x: number; y: number };
}

export interface AsepriteSlice {
  name: string;
  color?: string;
  data?: string;
  /** Sorted by frame. */
  keys: AsepriteSliceKey[];
}

export interface AsepriteLayer {
  name: string;
  group?: string;
  opacity: number;
  blendMode: string;
  color?: string;
  data?: string;
}

/** A cel's user data: what a game marks a frame with (a footstep, a hit) on a layer kept for marks. */
export interface AsepriteCue {
  layer: string;
  frame: number;
  data: string;
}

/** A marker a clip fires when its playback reaches `frame` (the frame's position within the clip). */
export interface ClipMarker {
  frame: number;
  name: string;
}

export interface AsepriteSheet {
  /** The sheet image's file name as written in the JSON (relative to the JSON file). */
  image: string;
  width: number;
  height: number;
  frames: AsepriteFrame[];
  tags: AsepriteTag[];
  /** One clip per tag, by tag name; frames are sheet frame indices, durations from the frames. */
  clips: Record<string, AnimationClip>;
  /** Every frame in order, looping: for a sheet with no tags. */
  all: AnimationClip;
  slices: AsepriteSlice[];
  layers: AsepriteLayer[];
  cues: AsepriteCue[];
}
