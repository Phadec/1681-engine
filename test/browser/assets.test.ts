import { Sprite, Spritesheet, Texture, type Application } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import interUrl from 'vitepress/dist/client/theme-default/fonts/inter-roman-latin.woff2?url';
import { AssetLoader } from '../../src/assets/AssetLoader';
import { TextureRegistry } from '../../src/core/TextureRegistry';
import { canvasOf, destroyApp, jsonUrl, makeApp, pngUrl, renderAndRead, rgb } from './gl';

/** A mono 16-bit PCM WAV of `samples`, so `decodeAudioData` gets a real file with known contents. */
function wav(samples: Float32Array, rate: number): Blob {
  const data = samples.length * 2;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, data, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s)) * 32767), true));
  return new Blob([buf], { type: 'audio/wav' });
}

const RATE = 8000;
const tone = Float32Array.from({ length: 800 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / RATE));
const context = () => new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: RATE });

describe('audio', () => {
  test('decodes a real WAV through the given context', async () => {
    const url = URL.createObjectURL(wav(tone, RATE));
    const loader = new AssetLoader(new TextureRegistry(), { audioContext: context });
    await loader.audio('beep', url).load();
    const buffer = loader.getAudio('beep')!;
    expect(buffer.sampleRate).toBe(RATE);
    expect(buffer.length).toBe(tone.length);
    expect(buffer.numberOfChannels).toBe(1);
    const got = buffer.getChannelData(0);
    for (const i of [0, 1, 37, 400, 799]) expect(got[i]).toBeCloseTo(tone[i]!, 3);
  });

  test('keeps the bytes until a context exists, then decodes them once', async () => {
    const url = URL.createObjectURL(wav(tone, RATE));
    const loader = new AssetLoader(new TextureRegistry(), { audioContext: () => null });
    await loader.audio('beep', url).load();
    expect(loader.getAudio('beep')).toBe(null);
    const ctx = context();
    const [a, b] = await Promise.all([loader.decodeAudio('beep', ctx), loader.decodeAudio('beep', ctx)]);
    expect(a).toBe(b);
    expect(a.length).toBe(tone.length);
    expect(loader.getAudio('beep')).toBe(a);
  });

  test('a file that is not audio fails naming its URL', async () => {
    const url = URL.createObjectURL(new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])]));
    const loader = new AssetLoader(new TextureRegistry(), { audioContext: context });
    await expect(loader.audio('junk', url).load()).rejects.toThrow(url);
  });
});

describe('font', () => {
  test('a woff2 lands in document.fonts and canvas text measures with it', async () => {
    const family = 'E1681Inter';
    const measure = (font: string) => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = font;
      return ctx.measureText('iiiiiWWWWW').width;
    };
    const fallback = measure('40px monospace');
    expect(measure(`40px "${family}", monospace`)).toBe(fallback);
    await new AssetLoader(new TextureRegistry()).font(family, interUrl).load();
    expect([...document.fonts].some((f) => f.family.replace(/"/g, '') === family && f.status === 'loaded')).toBe(true);
    expect(document.fonts.check(`40px "${family}"`)).toBe(true);
    // monospace gives i and W one width; Inter does not, so the run measures differently once the face is in
    expect(measure(`40px "${family}", monospace`)).not.toBe(fallback);
  });

  test('bytes that are not a font fail naming the family and the URL', async () => {
    const url = URL.createObjectURL(new Blob(['not a font at all']));
    await expect(new AssetLoader(new TextureRegistry()).font('E1681Broken', url).load()).rejects.toThrow(/E1681Broken.*blob:|blob:.*E1681Broken/);
  });
});

describe('image', () => {
  test('a PNG becomes a texture whose pixels are the file’s', async () => {
    const url = await pngUrl(canvasOf(4, 2, (c) => {
      c.fillStyle = '#ff0000';
      c.fillRect(0, 0, 2, 2);
      c.fillStyle = '#00ff00';
      c.fillRect(2, 0, 2, 2);
    }));
    const textures = new TextureRegistry();
    await new AssetLoader(textures).image('pic', url).spritesheet('sheet', url, { frameWidth: 2, frameHeight: 2 }).load();
    expect(textures.get('pic').width).toBe(4);
    expect(textures.get('sheet', 1).frame.x).toBe(2);
    const app = await makeApp(8, 8);
    try {
      app.stage.addChild(new Sprite(textures.get('sheet', 1)));
      const pic = new Sprite(textures.get('pic'));
      pic.position.set(0, 4);
      app.stage.addChild(pic);
      const f = renderAndRead(app);
      expect(f.at(0, 0)).toEqual(rgb(0x00ff00));
      expect(f.at(2, 0)).toEqual(rgb(0x000000));
      expect(f.at(0, 4)).toEqual(rgb(0xff0000));
      expect(f.at(3, 5)).toEqual(rgb(0x00ff00));
    } finally {
      destroyApp(app);
    }
  });

  test('bytes that are not an image fail naming the URL', async () => {
    const url = URL.createObjectURL(new Blob(['not a png'], { type: 'image/png' }));
    await expect(new AssetLoader(new TextureRegistry()).image('bad', url).load()).rejects.toThrow(url);
  });
});

describe('atlas', () => {
  const RED = 0xff0000;
  const GREEN = 0x00ff00;
  const BLUE = 0x0000ff;
  const YELLOW = 0xffff00;
  const MAGENTA = 0xff00ff;
  const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

  // page 1: a plain frame, a trimmed one, and one TexturePacker turned 90° clockwise to fit
  const page1 = () =>
    canvasOf(16, 16, (c) => {
      c.fillStyle = css(RED);
      c.fillRect(0, 0, 4, 4);
      c.fillStyle = css(GREEN);
      c.fillRect(4, 0, 4, 2);
      // the turned sprite is 6 wide and 2 tall: blue on its left half, yellow on its right. Turned clockwise, its
      // left end is the top of the 2-wide, 6-tall column on the page
      c.fillStyle = css(BLUE);
      c.fillRect(0, 8, 2, 3);
      c.fillStyle = css(YELLOW);
      c.fillRect(0, 11, 2, 3);
    });

  let app: Application;
  let page1Url: string;
  let json1: Record<string, unknown>;
  let textures: TextureRegistry;
  let loader: AssetLoader;

  beforeAll(async () => {
    app = await makeApp(48, 48);
    page1Url = await pngUrl(page1());
    const page2Url = await pngUrl(canvasOf(8, 8, (c) => {
      c.fillStyle = css(MAGENTA);
      c.fillRect(0, 0, 4, 4);
    }));
    const json2 = jsonUrl({ frames: { second: { frame: { x: 0, y: 0, w: 4, h: 4 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 4, h: 4 }, sourceSize: { w: 4, h: 4 } } }, meta: { image: page2Url, size: { w: 8, h: 8 }, scale: '1' } });
    json1 = {
      frames: {
        plain: { frame: { x: 0, y: 0, w: 4, h: 4 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 4, h: 4 }, sourceSize: { w: 4, h: 4 } },
        trimmed: { frame: { x: 4, y: 0, w: 4, h: 2 }, rotated: false, trimmed: true, spriteSourceSize: { x: 2, y: 3, w: 4, h: 2 }, sourceSize: { w: 8, h: 8 } },
        turned: { frame: { x: 0, y: 8, w: 6, h: 2 }, rotated: true, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 6, h: 2 }, sourceSize: { w: 6, h: 2 } },
      },
      animations: { blink: ['plain', 'second'] },
      meta: { image: page1Url, size: { w: 16, h: 16 }, scale: '1', related_multi_packs: [json2] },
    };
    textures = new TextureRegistry();
    loader = new AssetLoader(textures);
    await loader.atlas('atlas', jsonUrl(json1)).load();
  });
  afterAll(() => destroyApp(app));

  test('registers every frame of every page under one key, with its sizes', () => {
    const info = loader.getAtlas('atlas');
    expect(info.pages).toBe(2);
    expect(info.frames.sort()).toEqual(['plain', 'second', 'trimmed', 'turned']);
    expect(info.animations).toEqual({ blink: ['plain', 'second'] });
    const trimmed = textures.get('atlas', 'trimmed');
    expect([trimmed.orig.width, trimmed.orig.height]).toEqual([8, 8]);
    expect([trimmed.frame.width, trimmed.frame.height]).toEqual([4, 2]);
    expect([trimmed.trim!.x, trimmed.trim!.y]).toEqual([2, 3]);
    const turned = textures.get('atlas', 'turned');
    expect([turned.width, turned.height]).toEqual([6, 2]);
    expect([turned.frame.width, turned.frame.height]).toEqual([2, 6]);
    expect(textures.get('atlas', 'second').source).toBe(textures.get('atlas~1').source);
  });

  test('draws plain, trimmed, turned and second-page frames where they belong', () => {
    app.stage.removeChildren();
    const put = (frame: string, x: number, y: number) => {
      const s = new Sprite(textures.get('atlas', frame));
      s.position.set(x, y);
      app.stage.addChild(s);
    };
    put('plain', 0, 0);
    put('trimmed', 10, 0);
    put('turned', 20, 0);
    put('second', 30, 0);
    const f = renderAndRead(app);
    expect(f.at(3, 3)).toEqual(rgb(RED));
    // trimmed: the 4×2 pixels sit at (2, 3) inside the 8×8 sprite, and nothing is drawn where the trim cut
    expect(f.at(10 + 2, 0 + 3)).toEqual(rgb(GREEN));
    expect(f.at(10 + 5, 0 + 4)).toEqual(rgb(GREEN));
    expect(f.at(10, 0)).toEqual(rgb(0));
    expect(f.count((c) => c[1] === 255 && c[0] === 0, 10, 0, 18, 8)).toBe(8);
    // turned back: blue on the left, yellow on the right, 6 × 2 on screen
    for (let x = 0; x < 3; x++) expect(f.at(20 + x, 1)).toEqual(rgb(BLUE));
    for (let x = 3; x < 6; x++) expect(f.at(20 + x, 0)).toEqual(rgb(YELLOW));
    expect(f.at(20, 2)).toEqual(rgb(0));
    expect(f.at(30, 0)).toEqual(rgb(MAGENTA));
  });

  test('draws every frame of page 1 exactly as Pixi’s own Spritesheet does', async () => {
    const sheet = new Spritesheet(Texture.from(page1()), json1 as never);
    await sheet.parse();
    for (const name of ['plain', 'trimmed', 'turned']) {
      app.stage.removeChildren();
      const ours = new Sprite(textures.get('atlas', name));
      const pixi = new Sprite(sheet.textures[name]!);
      pixi.position.set(24, 0);
      app.stage.addChild(ours, pixi);
      const f = renderAndRead(app);
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) expect(f.at(x, y), `${name} at ${x},${y}`).toEqual(f.at(24 + x, y));
    }
  });
});
