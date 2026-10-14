import { Sprite, Texture } from 'pixi.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Engine } from '../../src/engine/Engine';
import { Scene } from '../../src/engine/Scene';
import { CrossfadeTransition } from '../../src/transitions/CrossfadeTransition';
import { DitherWipeTransition } from '../../src/transitions/DitherWipeTransition';
import { FadeTransition } from '../../src/transitions/FadeTransition';
import { Letterbox } from '../../src/transitions/Letterbox';
import type { Transition, TransitionContext } from '../../src/transitions/Transition';
import { transitionTo } from '../../src/transitions/transitionTo';
import { renderAndRead, rgb } from './gl';

const W = 64;
const H = 48;
let engine: Engine;
beforeEach(async () => {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  engine = await Engine.create({ parent, width: W, height: H, background: '#000000' });
});
afterEach(async () => {
  await engine.destroy();
});

/** A scene that fills the screen with one colour, and can run code while it enters. */
class Flat extends Scene {
  constructor(
    readonly color: number,
    private readonly entering?: () => void | Promise<void>,
  ) {
    super();
  }

  override async onEnter(): Promise<void> {
    const s = new Sprite(Texture.WHITE);
    s.tint = this.color;
    s.setSize(W, H);
    this.root.addChild(s);
    await this.entering?.();
  }
}

const read = (x = W / 2, y = H / 2) => renderAndRead(engine.app).at(x, y);
const layers = () => engine.app.stage.children.length;

test('a fade covers the old scene, swaps it while covered, and reveals the new one', async () => {
  await engine.scenes.replace(new Flat(0xff0000));
  expect(read()).toEqual(rgb(0xff0000));
  const before = layers();
  let whileEntering: number[] = [];
  const next = new Flat(0x00ff00, () => {
    whileEntering = read();
  });
  await transitionTo(engine, next, new FadeTransition({ duration: 40, color: 0x0000ff }));
  // the new scene entered behind a fully covering sheet of the fade's colour
  expect(whileEntering).toEqual(rgb(0x0000ff));
  expect(engine.scene).toBe(next);
  expect(read()).toEqual(rgb(0x00ff00));
  expect(layers()).toBe(before);
});

test('an async onEnter is waited out under the cover, however long it loads', async () => {
  await engine.scenes.replace(new Flat(0xff0000));
  const seen: number[][] = [];
  const next = new Flat(0x00ff00, async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 30));
      seen.push(read());
    }
  });
  await transitionTo(engine, next, new FadeTransition({ duration: 20 }));
  expect(seen).toEqual([rgb(0), rgb(0), rgb(0)]);
  expect(read()).toEqual(rgb(0x00ff00));
});

test('push and pop run behind a transition; pop needs no scene', async () => {
  const level = new Flat(0xff0000);
  await engine.scenes.replace(level);
  const menu = new Flat(0x00ff00);
  await transitionTo(engine, menu, new FadeTransition({ duration: 20 }), 'push');
  expect(engine.scene).toBe(menu);
  await transitionTo(engine, null, new FadeTransition({ duration: 20 }), 'pop');
  expect(engine.scene).toBe(level);
  expect(read()).toEqual(rgb(0xff0000));
});

test('a replace with no scene throws, and the overlay is still removed and the transition disposed', async () => {
  await engine.scenes.replace(new Flat(0xff0000));
  const before = layers();
  let disposed = 0;
  const t = new FadeTransition({ duration: 10 });
  const dispose = t.dispose.bind(t);
  t.dispose = () => {
    disposed++;
    dispose();
  };
  await expect(transitionTo(engine, null, t)).rejects.toThrow(/needs a scene/);
  expect(disposed).toBe(1);
  expect(layers()).toBe(before);
  expect(read()).toEqual(rgb(0xff0000));
});

test('a scene whose onEnter throws is re-thrown, after the overlay is gone', async () => {
  await engine.scenes.replace(new Flat(0xff0000));
  const before = layers();
  const bad = new Flat(0x00ff00, () => {
    throw new Error('level failed to load');
  });
  await expect(transitionTo(engine, bad, new FadeTransition({ duration: 10 }))).rejects.toThrow('level failed to load');
  expect(layers()).toBe(before);
});

test('a second transition waits for the first instead of drawing over it', async () => {
  await engine.scenes.replace(new Flat(0xff0000));
  const order: string[] = [];
  const tracked = (name: string): Transition => {
    const fade = new FadeTransition({ duration: 20 });
    return {
      cover: async (ctx: TransitionContext) => {
        order.push(`${name} cover`);
        await fade.cover(ctx);
      },
      reveal: async (ctx: TransitionContext) => {
        await fade.reveal(ctx);
        order.push(`${name} reveal`);
      },
      dispose: () => fade.dispose(),
    };
  };
  const a = transitionTo(engine, new Flat(0x00ff00), tracked('a'));
  const b = transitionTo(engine, new Flat(0x0000ff), tracked('b'));
  await Promise.all([a, b]);
  expect(order).toEqual(['a cover', 'a reveal', 'b cover', 'b reveal']);
  expect(read()).toEqual(rgb(0x0000ff));
});

test('a failed transition does not stop the next one from running', async () => {
  await engine.scenes.replace(new Flat(0xff0000));
  const failed = transitionTo(engine, null, new FadeTransition({ duration: 10 }));
  const next = transitionTo(engine, new Flat(0x00ff00), new FadeTransition({ duration: 10 }));
  await expect(failed).rejects.toThrow();
  await next;
  expect(read()).toEqual(rgb(0x00ff00));
});

test('a crossfade keeps the old frame over the new scene while it loads, then fades it out', async () => {
  await engine.scenes.replace(new Flat(0xff0000));
  let whileEntering: number[] = [];
  const next = new Flat(0x00ff00, () => {
    whileEntering = read();
  });
  await transitionTo(engine, next, new CrossfadeTransition({ duration: 40 }));
  expect(whileEntering).toEqual(rgb(0xff0000));
  expect(read()).toEqual(rgb(0x00ff00));
});

test('a dither wipe to the right covers the left first, in hard dither cells, and covers all of it in the end', async () => {
  await engine.scenes.replace(new Flat(0xffffff));
  const wipe = new DitherWipeTransition({ duration: 10_000, cell: 1, color: 0x000000 });
  const layer = new (await import('pixi.js')).Container();
  engine.app.stage.addChild(layer);
  const ctx: TransitionContext = { stage: engine.stage, app: engine.app, layer };
  void wipe.cover(ctx);
  // half way, set by hand: the tween is far too slow to have moved
  (wipe as unknown as { state: { p: number }; paint(): void }).state.p = 0.5;
  (wipe as unknown as { paint(): void }).paint();
  const f = renderAndRead(engine.app);
  const dark = (x0: number, x1: number) => f.count((c) => c[0] === 0, x0, 0, x1, H);
  expect(dark(0, 8)).toBeGreaterThan(dark(W - 8, W));
  // every pixel is either the scene or the wipe: no blended greys
  expect(f.count((c) => c[0] !== 0 && c[0] !== 255)).toBe(0);
  (wipe as unknown as { state: { p: number } }).state.p = 1;
  (wipe as unknown as { paint(): void }).paint();
  expect(renderAndRead(engine.app).count((c) => c[0] === 255)).toBe(0);
  engine.stage.tweens.killTweensOf((wipe as unknown as { state: object }).state);
  wipe.dispose();
  layer.destroy();
});

test('a dither wipe runs a full transition and leaves nothing behind', async () => {
  await engine.scenes.replace(new Flat(0xff0000));
  const before = layers();
  let whileEntering: number[] = [];
  for (const direction of ['left', 'up', 'none'] as const) {
    await transitionTo(
      engine,
      new Flat(0x00ff00, () => {
        whileEntering = read(4, 4);
      }),
      new DitherWipeTransition({ duration: 30, direction, cell: 2 }),
    );
    expect(whileEntering).toEqual(rgb(0));
    expect(read()).toEqual(rgb(0x00ff00));
  }
  expect(layers()).toBe(before);
});

test('letterbox bars slide in to their share of the screen in whole pixels, and back out', async () => {
  await engine.scenes.replace(new Flat(0xffffff));
  const bars = new Letterbox(engine.stage, { share: 0.25, color: 0xff0000 });
  expect(bars.shown).toBe(false);
  expect(read(0, 0)).toEqual(rgb(0xffffff));
  await bars.show(0);
  expect(bars.shown).toBe(true);
  let f = renderAndRead(engine.app);
  // a quarter of 48 is 12 px top and bottom
  expect(f.at(0, 11)).toEqual(rgb(0xff0000));
  expect(f.at(0, 12)).toEqual(rgb(0xffffff));
  expect(f.at(0, H - 12)).toEqual(rgb(0xff0000));
  expect(f.at(0, H - 13)).toEqual(rgb(0xffffff));
  await bars.hide(40);
  expect(bars.shown).toBe(false);
  f = renderAndRead(engine.app);
  expect(f.at(0, 0)).toEqual(rgb(0xffffff));
  // half way through a slide, every bar height is a whole pixel: rows are bar or scene, never blended
  void bars.show(10_000);
  for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
  f = renderAndRead(engine.app);
  for (let y = 0; y < H; y++) {
    const c = f.at(5, y);
    expect(c[1] === 0 || c[1] === 255).toBe(true);
  }
  bars.destroy();
  expect(read(0, 0)).toEqual(rgb(0xffffff));
});
