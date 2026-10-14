import { Texture, type Container } from 'pixi.js';
import { Emitter, FloatingText, type Camera, type FloatingTextStyle, type Stage } from '../../src';

const PLUS: FloatingTextStyle = { size: 8, color: '#fff0a0' };

/**
 * The level's particles and floating text. Particles are the engine's `Emitter`s on one white texel each, sized and
 * tinted per particle, so the example needs no particle art; they live in world space under the scene's root.
 */
export class Effects {
  /** Kicked up by running and landing: earth-coloured, falling back down. */
  private readonly dust = new Emitter({
    texture: Texture.WHITE,
    rate: 22,
    lifetime: [0.25, 0.45],
    speed: [12, 36],
    angle: -Math.PI / 2,
    spread: 1.3,
    gravityY: 160,
    drag: 2,
    size: { start: 2, end: 1 },
    tint: { start: 0xd8b48a, end: 0x8d6038 },
    alpha: [
      [0, 0.9],
      [1, 0],
    ],
  });
  /** A coin's sparkle: bright, additive, thrown in every direction. */
  private readonly sparkle = new Emitter({
    texture: Texture.WHITE,
    lifetime: [0.3, 0.55],
    speed: [40, 95],
    spread: Math.PI,
    gravityY: 140,
    drag: 1.5,
    size: { start: 2, end: 1 },
    tint: { start: 0xfff6c0, end: 0xff9a30 },
    blend: 'add',
  });
  private readonly text: FloatingText;

  constructor(
    stage: Stage,
    private readonly root: Container,
  ) {
    this.dust.view.zIndex = 50;
    this.sparkle.view.zIndex = 60;
    root.addChild(this.dust.view, this.sparkle.view);
    // a system font, so nothing is fetched; a game with a pixel font loads it (document.fonts.load) before this.
    // Under the scene's root, the labels leave with the scene.
    this.text = new FloatingText(stage, { fontFamily: 'monospace', depth: 70, parent: root });
    this.text.install(PLUS);
  }

  /** Dust streams from the feet while running on the ground. */
  running(on: boolean, x: number, y: number, facing: number): void {
    this.dust.setPosition(x - facing * 3, y - 1);
    if (on && !this.dust.emitting) this.dust.start();
    else if (!on && this.dust.emitting) this.dust.stop();
  }

  /** A puff on touchdown, bigger the harder the fall. */
  landed(x: number, y: number, fallSpeed: number): void {
    this.dust.burst(Math.round(4 + Math.min(10, fallSpeed / 40)), x, y - 1);
  }

  coin(x: number, y: number): void {
    this.sparkle.burst(16, x, y);
    this.text.float(x, y - 4, '+1', PLUS, { rise: 14, holdMs: 200, fadeMs: 450 });
  }

  update(dt: number, camera: Camera): void {
    this.dust.update(dt, camera);
    this.sparkle.update(dt, camera);
  }

  destroy(): void {
    this.dust.destroy();
    this.sparkle.destroy();
    this.text.clear();
  }
}
