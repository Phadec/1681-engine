import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tagFrames } from './asepriteTags.ts';
import { sliceAt, sliceBorders, sliceNamed } from './asepriteSlices.ts';
import { clipMarkers, frameNamed, parseAseprite } from './parseAseprite.ts';

// Hand-written in the shapes Aseprite 1.3 writes: four 16x16 frames in a row, three tags, a slice, two layers.
const meta = {
  app: 'https://www.aseprite.org/',
  version: '1.3.7',
  image: 'hero.png',
  format: 'RGBA8888',
  size: { w: 64, h: 16 },
  scale: '1',
  frameTags: [
    { name: 'idle', from: 0, to: 1, direction: 'forward', color: '#000000ff' },
    { name: 'run', from: 0, to: 3, direction: 'pingpong' },
    { name: 'land', from: 2, to: 3, direction: 'reverse', repeat: '2', data: 'heavy' },
  ],
  layers: [
    { name: 'body', opacity: 255, blendMode: 'normal' },
    { name: 'events', opacity: 0, blendMode: 'normal', cels: [{ frame: 1, data: 'step' }, { frame: 3, data: 'step' }, { frame: 2, color: '#ff0000ff' }] },
  ],
  slices: [
    {
      name: 'panel',
      color: '#0000ffff',
      keys: [
        { frame: 2, bounds: { x: 0, y: 0, w: 20, h: 12 }, center: { x: 4, y: 3, w: 10, h: 5 }, pivot: { x: 10, y: 12 } },
        { frame: 0, bounds: { x: 0, y: 0, w: 16, h: 16 }, center: { x: 5, y: 5, w: 6, h: 6 } },
      ],
    },
  ],
};

const frame = (i: number, duration: number) => ({
  frame: { x: i * 16, y: 0, w: 16, h: 16 },
  rotated: false,
  trimmed: false,
  spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
  sourceSize: { w: 16, h: 16 },
  duration,
});
const durations = [100, 150, 80, 200];

const arrayJson = { frames: durations.map((d, i) => ({ filename: `hero ${i}.aseprite`, ...frame(i, d) })), meta };
const hashJson = { frames: Object.fromEntries(durations.map((d, i) => [`hero ${i}.aseprite`, frame(i, d)])), meta };

test('both frame layouts read the same', () => {
  const a = parseAseprite(arrayJson);
  const h = parseAseprite(hashJson);
  assert.deepEqual(a, h);
  assert.equal(a.frames.length, 4);
  assert.deepEqual(a.frames[2]!.rect, { x: 32, y: 0, w: 16, h: 16 });
  assert.equal(a.frames[1]!.duration, 150);
  assert.equal(frameNamed(a, 'hero 3.aseprite'), 3);
  assert.equal(a.image, 'hero.png');
  assert.equal(a.width, 64);
});

test('tags become clips with each frame\'s own duration', () => {
  const s = parseAseprite(arrayJson);
  assert.deepEqual(s.clips.idle, { frames: [0, 1], durations: [100, 150], loop: true });
  assert.deepEqual(s.clips.run!.frames, [0, 1, 2, 3, 2, 1], 'a looping ping-pong does not double its turning frames');
  assert.deepEqual(s.clips.run!.durations, [100, 150, 80, 200, 80, 150]);
  assert.deepEqual(s.clips.land, { frames: [3, 2, 3, 2], durations: [200, 80, 200, 80], loop: false }, 'repeat 2 plays twice, then holds');
  assert.equal(s.tags[2]!.data, 'heavy');
  assert.deepEqual(s.all.frames, [0, 1, 2, 3]);
});

test('every direction, forever and repeated', () => {
  assert.deepEqual(tagFrames(0, 3, 'forward', 0), [0, 1, 2, 3]);
  assert.deepEqual(tagFrames(0, 3, 'reverse', 0), [3, 2, 1, 0]);
  assert.deepEqual(tagFrames(0, 3, 'pingpong', 0), [0, 1, 2, 3, 2, 1]);
  assert.deepEqual(tagFrames(0, 3, 'pingpong_reverse', 0), [3, 2, 1, 0, 1, 2]);
  assert.deepEqual(tagFrames(0, 1, 'pingpong', 0), [0, 1], 'two frames: the round trip is the two of them');
  assert.deepEqual(tagFrames(5, 5, 'pingpong', 0), [5]);
  assert.deepEqual(tagFrames(0, 2, 'forward', 2), [0, 1, 2, 0, 1, 2]);
  assert.deepEqual(tagFrames(0, 2, 'reverse', 2), [2, 1, 0, 2, 1, 0]);
  assert.deepEqual(tagFrames(0, 2, 'pingpong', 1), [0, 1, 2]);
  assert.deepEqual(tagFrames(0, 2, 'pingpong', 2), [0, 1, 2, 1, 0], 'each pass one way counts once; passes share the turn');
  assert.deepEqual(tagFrames(0, 2, 'pingpong', 3), [0, 1, 2, 1, 0, 1, 2]);
  assert.deepEqual(tagFrames(0, 2, 'pingpong_reverse', 2), [2, 1, 0, 1, 2]);
  assert.deepEqual(tagFrames(4, 4, 'pingpong', 3), [4, 4, 4]);
});

test('direction and repeat are read leniently, as older files write them', () => {
  const json = { frames: [frame(0, 100), frame(1, 0)], meta: { frameTags: [{ name: 'a', from: 0, to: 1 }, { name: 'b', from: 0, to: 1, direction: 'sideways', repeat: 'x' }] } };
  const s = parseAseprite(json);
  assert.equal(s.tags[0]!.direction, 'forward');
  assert.equal(s.tags[1]!.direction, 'forward');
  assert.equal(s.tags[1]!.repeat, 0);
  assert.equal(s.frames[1]!.duration, 100, 'a frame with no duration takes Aseprite\'s default');
  assert.equal(s.image, '');
});

test('two tags of one name both survive', () => {
  const json = { frames: [frame(0, 100), frame(1, 100)], meta: { frameTags: [{ name: 'a', from: 0, to: 0 }, { name: 'a', from: 1, to: 1 }] } };
  assert.deepEqual(Object.keys(parseAseprite(json).clips), ['a', 'a#2']);
});

test('a trimmed frame keeps its source size and offset', () => {
  const json = {
    frames: [{ frame: { x: 2, y: 3, w: 10, h: 12 }, trimmed: true, spriteSourceSize: { x: 3, y: 4, w: 10, h: 12 }, sourceSize: { w: 16, h: 16 }, duration: 90 }],
    meta: {},
  };
  const f = parseAseprite(json).frames[0]!;
  assert.deepEqual([f.trimmed, f.sourceW, f.sourceH, f.offsetX, f.offsetY], [true, 16, 16, 3, 4]);
});

test('slices: keys sorted, the key in effect per frame, 9-slice borders and pivot', () => {
  const s = parseAseprite(arrayJson);
  const panel = sliceNamed(s, 'panel')!;
  assert.deepEqual(panel.keys.map((k) => k.frame), [0, 2]);
  assert.equal(sliceAt(panel, 1)!.bounds.w, 16);
  assert.equal(sliceAt(panel, 3)!.bounds.w, 20);
  assert.deepEqual(sliceBorders(sliceAt(panel, 0)!), { left: 5, top: 5, right: 5, bottom: 5 });
  assert.deepEqual(sliceBorders(sliceAt(panel, 2)!), { left: 4, top: 3, right: 6, bottom: 4 });
  assert.deepEqual(sliceAt(panel, 2)!.pivot, { x: 10, y: 12 });
  assert.equal(sliceAt({ name: 'late', keys: [{ frame: 2, bounds: { x: 0, y: 0, w: 1, h: 1 } }] }, 0), undefined);
  assert.equal(sliceBorders({ frame: 0, bounds: { x: 0, y: 0, w: 1, h: 1 } }), undefined);
});

test('layers, and cel data as markers in clip positions', () => {
  const s = parseAseprite(arrayJson);
  assert.deepEqual(s.layers.map((l) => [l.name, l.opacity]), [['body', 255], ['events', 0]]);
  assert.deepEqual(s.cues, [{ layer: 'events', frame: 1, data: 'step' }, { layer: 'events', frame: 3, data: 'step' }]);
  const m = clipMarkers(s, 'events');
  assert.deepEqual(m.run, [{ frame: 1, name: 'step' }, { frame: 3, name: 'step' }, { frame: 5, name: 'step' }], 'the ping-pong shows frame 1 twice');
  assert.deepEqual(m.idle, [{ frame: 1, name: 'step' }]);
  assert.deepEqual(clipMarkers(s, 'body'), {});
});

test('bad input is refused with a reason', () => {
  assert.throws(() => parseAseprite(null), /not an Aseprite JSON/);
  assert.throws(() => parseAseprite({ meta: {} }), /no "frames"/);
  assert.throws(() => parseAseprite({ frames: [], meta: {} }), /no frames/);
  assert.throws(() => parseAseprite({ frames: [{ ...frame(0, 100), rotated: true }], meta: {} }), /rotated/);
  assert.throws(() => parseAseprite({ frames: [frame(0, 100)], meta: { frameTags: [{ name: 'x', from: 0, to: 3 }] } }), /tag "x" spans/);
});
