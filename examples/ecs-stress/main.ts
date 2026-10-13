import { Particle, ParticleContainer, Texture } from 'pixi.js';
import { Engine, Scene, defineFields, system } from '../../src';

/*
 * How many bodies the ECS can move: every body has a position and a velocity in typed-array columns, one system walks
 * them through the cached slot list and bounces them off the edges, another copies positions into a Pixi
 * ParticleContainer. The HUD shows the frame rate and how long the simulation step takes. Add bodies with the
 * buttons and watch where the frame rate goes (drawing, usually, not the ECS).
 */

const Position = defineFields('Position', { x: 'f32', y: 'f32' });
const Velocity = defineFields('Velocity', { x: 'f32', y: 'f32' });
const Look = defineFields('Look', { particle: 'u32' });

const WORLD_W = 1600;
const WORLD_H = 900;

class Stress extends Scene {
  private readonly particles: Particle[] = [];
  private container!: ParticleContainer;
  private stepMs = 0;
  private readonly label = document.getElementById('hud')!;

  override onEnter(): void {
    const { stage } = this.engine;
    this.container = new ParticleContainer({ dynamicProperties: { position: true } });
    this.root.addChild(this.container);
    stage.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H).centerOn(WORLD_W / 2, WORLD_H / 2);

    this.world.addSystem(
      system('move', 'fixed', ({ world, dt }) => {
        const t0 = performance.now();
        const p = world.columns(Position);
        const v = world.columns(Velocity);
        const slots = world.slots(Position, Velocity);
        for (let k = 0; k < slots.length; k++) {
          const i = slots[k]!;
          let x = p.x[i]! + v.x[i]! * dt;
          let y = p.y[i]! + v.y[i]! * dt;
          if (x < 0 || x > WORLD_W) {
            v.x[i] = -v.x[i]!;
            x = Math.min(WORLD_W, Math.max(0, x));
          }
          if (y < 0 || y > WORLD_H) {
            v.y[i] = -v.y[i]!;
            y = Math.min(WORLD_H, Math.max(0, y));
          }
          p.x[i] = x;
          p.y[i] = y;
        }
        this.stepMs = this.stepMs * 0.9 + (performance.now() - t0) * 0.1;
      }),
    );
    this.world.addSystem(
      system('draw', 'frame', ({ world }) => {
        const p = world.columns(Position);
        const look = world.columns(Look);
        const slots = world.slots(Position, Look);
        for (let k = 0; k < slots.length; k++) {
          const i = slots[k]!;
          const particle = this.particles[look.particle[i]!]!;
          particle.x = p.x[i]!;
          particle.y = p.y[i]!;
        }
        this.container.update();
      }),
    );

    for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-add]')) {
      button.onclick = () => this.add(Number(button.dataset.add));
    }
    document.getElementById('clear')!.onclick = () => this.clearAll();
    this.add(10_000);
  }

  override update(): void {
    this.label.textContent = `${this.world.count(Position).toLocaleString()} bodies · ${Math.round(this.engine.app.ticker.FPS)} fps · step ${this.stepMs.toFixed(2)} ms`;
  }

  private add(n: number): void {
    for (let k = 0; k < n; k++) {
      const hue = Math.random();
      const particle = new Particle({ texture: Texture.WHITE, x: 0, y: 0, scaleX: 0.25, scaleY: 0.25, tint: hsl(hue) });
      this.container.addParticle(particle);
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 120;
      this.world.spawn(
        [Position, { x: Math.random() * WORLD_W, y: Math.random() * WORLD_H }],
        [Velocity, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }],
        [Look, { particle: this.particles.length }],
      );
      this.particles.push(particle);
    }
  }

  private clearAll(): void {
    // destroying while walking is deferred to the end of the walk, so this is safe
    this.world.each(Position, (e) => this.world.destroy(e));
    this.container.removeParticles();
    this.particles.length = 0;
  }
}

function hsl(h: number): number {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (0.55 - 0.45 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

const engine = await Engine.create({ parent: document.getElementById('app')!, background: '#0e0c14', zoom: 0.75 });
engine.events.on('error', ({ where, error }) => console.error(where, error));
(globalThis as { engine?: Engine }).engine = engine;
await engine.scenes.replace(new Stress());
