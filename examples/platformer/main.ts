import { DebugOverlay, Engine, registerSounds } from '../../src';
import { paintArt } from './art';
import { Game } from './Game';
import { LevelScene } from './LevelScene';
import { readLevel } from './level';
import { Progress } from './Progress';
import { TitleScene } from './TitleScene';

/*
 * A small side-scrolling platformer, the engine's newer modules working together with nothing borrowed from any
 * other game: a rigid-body `PhysicsWorld` built from a tile grid (crates, a moving platform, one-way planks, sensor
 * coins and a goal), particles and floating text, a canvas UI (HUD, pause dialog, keyboard and gamepad focus), a
 * versioned save, dithered scene transitions, two languages, rebindable keys and a debug overlay that draws the
 * physics. Every sprite is painted in code.
 */

// the sounds are written, not recorded: a few oscillator layers each
registerSounds({
  master: 0.5,
  recipes: {
    jump: { layers: [{ w: 'square', f: [330, 660], t: 0.12, g: 0.25, duty: 0.25, lp: [3000, 2000] }] },
    land: { layers: [{ w: 'noise', f: [900, 900], t: 0.08, g: 0.3, lp: [1200, 400] }] },
    coin: {
      layers: [
        { w: 'square', f: [988, 988], t: 0.06, g: 0.2, duty: 0.5 },
        { w: 'square', f: [1319, 1319], t: 0.18, d: 0.06, g: 0.2, duty: 0.5 },
      ],
    },
    clear: {
      layers: [523, 659, 784, 1047].map((f, i) => ({ w: 'tri' as const, f: [f, f] as [number, number], t: 0.22, d: i * 0.1, g: 0.3 })),
    },
  },
});

// the browser's own uses of these keys (scrolling, moving focus out of the canvas) get in the way; the debug overlay
// keeps its own key from the browser by itself
const KEPT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
window.addEventListener('keydown', (e) => {
  if (KEPT.has(e.code)) e.preventDefault();
});

const engine = await Engine.create({ parent: document.getElementById('app')!, background: '#14101c', zoom: 3, pixelPerfect: true });
engine.events.on('error', ({ where, error }) => console.error(where, error));
(globalThis as { engine?: Engine }).engine = engine;

paintArt(engine.stage.textures, readLevel());
const progress = new Progress();
await progress.load();

const game: Game = new Game(engine, progress, {
  title: (result) => new TitleScene(game, result),
  level: () => new LevelScene(game),
});

// F3: frame time, draw calls, entities, and every physics body's box (static green, moving cyan, dynamic yellow when
// standing and red in the air, sensors pink, one-way planks orange)
new DebugOverlay(engine, { key: 'F3', colliders: (draw) => game.debugBoxes?.(draw) });

await engine.scenes.replace(new TitleScene(game));
