/*
 * A stand-in for a file exported from Aseprite, made in code so the example ships no binary: a 16x16 figure in eleven
 * frames on one strip, and the JSON Aseprite would write beside it ("array" layout, with tags, a slice and an
 * "events" layer whose cels carry user data — where an artist marks the footsteps).
 */

export const FRAME = 16;

// frame → [body lift, left foot dx, right foot dx, squash]: enough to read as idle, run, jump, fall and land
const POSES: [number, number, number, number][] = [
  [0, -2, 2, 0], [1, -2, 2, 0], // 0-1 idle (breathing)
  [1, -4, 3, 0], [0, -1, 1, 0], [1, 3, -4, 0], [0, 1, -1, 0], // 2-5 run
  [2, -2, 2, -1], [4, -3, 3, -1], // 6-7 jump (crouch, spring)
  [3, -4, 4, 0], // 8 fall
  [-2, -4, 4, 2], [-1, -3, 3, 1], // 9-10 land (squash, recover)
];

export function paintSheet(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME * POSES.length;
  canvas.height = FRAME;
  const g = canvas.getContext('2d')!;
  POSES.forEach(([lift, lf, rf, squash], i) => {
    const ox = i * FRAME;
    g.fillStyle = '#3e2466';
    g.fillRect(ox + 6 + lf, 13, 3, 3);
    g.fillRect(ox + 7 + rf, 13, 3, 3);
    const h = 9 - squash;
    const top = 13 - h - Math.max(0, lift);
    g.fillStyle = '#8456c8';
    g.fillRect(ox + 4 - Math.max(0, squash), top, 8 + 2 * Math.max(0, squash), h);
    g.fillStyle = '#c8a0ff';
    g.fillRect(ox + 5, top + 1, 5, 3);
    g.fillStyle = '#fbf0ff';
    g.fillRect(ox + 9, top + 2, 1, 1);
  });
  return canvas;
}

export function sheetJson() {
  const durations = [400, 400, 90, 70, 90, 70, 60, 120, 100, 80, 120];
  return {
    frames: durations.map((duration, i) => ({
      filename: `figure ${i}.aseprite`,
      frame: { x: i * FRAME, y: 0, w: FRAME, h: FRAME },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: FRAME, h: FRAME },
      sourceSize: { w: FRAME, h: FRAME },
      duration,
    })),
    meta: {
      app: 'https://www.aseprite.org/',
      image: 'figure.png',
      size: { w: FRAME * durations.length, h: FRAME },
      frameTags: [
        { name: 'idle', from: 0, to: 1, direction: 'pingpong' },
        { name: 'run', from: 2, to: 5, direction: 'forward' },
        { name: 'jump', from: 6, to: 7, direction: 'forward', repeat: '1' },
        { name: 'fall', from: 8, to: 8, direction: 'forward' },
        { name: 'land', from: 9, to: 10, direction: 'forward', repeat: '1' },
      ],
      layers: [
        { name: 'figure', opacity: 255, blendMode: 'normal' },
        { name: 'events', opacity: 0, blendMode: 'normal', cels: [{ frame: 3, data: 'step' }, { frame: 5, data: 'step' }, { frame: 9, data: 'thud' }] },
      ],
      // the feet, as a pivot: where the sprite stands
      slices: [{ name: 'feet', keys: [{ frame: 0, bounds: { x: 0, y: 0, w: FRAME, h: FRAME }, pivot: { x: 8, y: 16 } }] }],
    },
  };
}
