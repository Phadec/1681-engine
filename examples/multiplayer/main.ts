import { Graphics, Text } from 'pixi.js';
import {
  Actions,
  Connection,
  Engine,
  HUMANOID_CLIPS,
  HUMANOID_POSES,
  HUMANOID_RIG,
  INPUT_FLAG_DASH,
  InterpolationBuffer,
  Keyboard,
  PosePlayer,
  PredictedMover,
  RigView,
  Scene,
  serverNow,
  system,
  type InputStep,
} from '../../src';
import { GRID, H, PARAMS, PORT, TILE, W, courtyard, type PlayerInfo } from './shared';

/*
 * Two or more tabs walking the same courtyard through the example server (npm run example:server). Your own body
 * moves the moment you press a key (prediction) and is rewound and replayed on every snapshot (reconciliation);
 * everyone else is drawn 100 ms in the past between snapshots (interpolation). The HUD shows the round trip and how
 * often the server disagreed with the prediction.
 */

type Action = 'left' | 'right' | 'up' | 'down' | 'roll';
type Clip = keyof typeof HUMANOID_CLIPS;

interface Body {
  view: RigView;
  label: Text;
  poses: PosePlayer<Clip>;
}

const NAMES = ['Ash', 'Bryn', 'Cael', 'Dara', 'Elin', 'Fenn', 'Gwen', 'Hale'];
const me: PlayerInfo = { name: NAMES[Math.floor(Math.random() * NAMES.length)]!, color: Math.floor(Math.random() * 0xffffff) | 0x404040 };

class Courtyard extends Scene {
  private readonly keyboard = new Keyboard();
  private readonly input = new Actions<Action>(this.keyboard, {
    left: ['KeyA', 'ArrowLeft', 'pad:left', 'pad:lx-'],
    right: ['KeyD', 'ArrowRight', 'pad:right', 'pad:lx+'],
    up: ['KeyW', 'ArrowUp', 'pad:up', 'pad:ly-'],
    down: ['KeyS', 'ArrowDown', 'pad:down', 'pad:ly+'],
    roll: ['Space', 'pad:a'],
  });
  private readonly conn = new Connection(`ws://${location.hostname || '127.0.0.1'}:${PORT}`, { hello: () => me });
  private readonly others = new InterpolationBuffer(100);
  private readonly bodies = new Map<number, Body>();
  private myId = -1;
  private mover: PredictedMover | null = null;
  private corrected = 0;
  private tracking = false;
  private status = document.getElementById('status')!;

  override onEnter(): void {
    const { stage } = this.engine;
    const floor = new Graphics();
    floor.rect(0, 0, W * TILE, H * TILE).fill(0x3a3448);
    const solid = courtyard();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (solid[y * W + x] === '1') floor.roundRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2, 3).fill(0x6a6480);
    floor.zIndex = -1e6;
    this.root.addChild(floor);
    stage.cameras.main.setBounds(0, 0, W * TILE, H * TILE);

    this.conn.events.on('welcome', (w) => {
      this.myId = w.id;
      this.status.textContent = `connected as ${me.name}`;
    });
    this.conn.events.on('snapshot', (s) => {
      for (const sp of s.sp ?? []) if (!this.bodies.has(sp.id)) this.addBody(sp.id, sp.data as PlayerInfo);
      for (const id of s.rm ?? []) this.removeBody(id);
      if (s.me) {
        if (!this.mover) this.mover = new PredictedMover(s.me[0], s.me[1], PARAMS, GRID);
        this.mover.reconcile(s.ack, s.me);
        if (this.mover.correction > 0) this.corrected++;
      }
      this.others.push(s.time, (s.up ?? []).filter((u) => u[0] !== this.myId));
    });
    this.conn.events.on('close', (e) => {
      this.status.textContent = e.willRetry ? 'disconnected, retrying… (is the server running? npm run example:server)' : `closed: ${e.reason}`;
      for (const id of [...this.bodies.keys()]) this.removeBody(id);
      this.mover = null;
      this.tracking = false;
      this.engine.stage.cameras.main.untrack();
    });
    this.conn.connect();

    this.world.addSystem(
      system('input', 'fixed', () => {
        this.input.poll();
        if (this.mover) {
          const [x, y] = this.input.vector('left', 'right', 'up', 'down');
          const step: InputStep = [x, y, this.input.pressed('roll') ? INPUT_FLAG_DASH : 0];
          this.conn.queueInput(this.mover.step(step), step);
        }
        this.input.endStep();
      }),
    );
    this.world.addSystem(system('send', 'frame', () => this.conn.flush()));
  }

  override update(dt: number): void {
    const now = serverNow();
    for (const [id, body] of this.bodies) {
      if (id === this.myId && this.mover) {
        this.mover.smooth(dt);
        const m = this.mover.mover;
        const moving = this.input.down('left') || this.input.down('right') || this.input.down('up') || this.input.down('down');
        this.place(body, this.mover.drawX, this.mover.drawY, m.lastDx < 0 ? -1 : 1, m.dashLeft > 0 ? 2 : moving ? 1 : 0, dt);
        if (!this.tracking) {
          this.engine.stage.cameras.main.track(body.view, { lerp: 0.12, offsetY: -30 });
          this.tracking = true;
        }
      } else {
        const s = this.others.sample(id, now);
        if (s) this.place(body, s.x, s.y, Math.cos(s.aim) < 0 ? -1 : 1, s.anim, dt);
      }
    }
    this.status.textContent = `${me.name} · ${this.bodies.size} in the courtyard · rtt ${Math.round(this.conn.rtt)} ms · corrections ${this.corrected}`;
  }

  override onExit(): void {
    this.conn.close();
    this.keyboard.destroy();
  }

  private place(body: Body, x: number, y: number, facing: 1 | -1, anim: number, dt: number): void {
    const clip: Clip = anim === 2 ? 'roll' : anim === 1 ? 'run' : 'idle';
    body.poses.play(clip, { fadeMs: clip === 'roll' ? 0 : 100, restart: clip === 'roll' && body.poses.current !== 'roll' });
    body.poses.update(dt);
    body.view.setPose(body.poses.pose);
    body.view.position.set(x, y + 4);
    body.view.facing = facing;
    body.view.zIndex = y;
    body.label.position.set(x, y - 76);
    body.label.zIndex = 1e6;
  }

  private addBody(id: number, info: PlayerInfo): void {
    const view = new RigView(HUMANOID_RIG, { torso: { color: info.color }, upperArmF: { color: info.color }, upperArmB: { color: info.color } }, undefined, { scale: 3 });
    const label = new Text({ text: info.name, style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } });
    label.anchor.set(0.5, 1);
    this.root.addChild(view, label);
    this.bodies.set(id, { view, label, poses: new PosePlayer(HUMANOID_POSES, HUMANOID_CLIPS, 'idle') });
  }

  private removeBody(id: number): void {
    const b = this.bodies.get(id);
    if (!b) return;
    b.view.destroy();
    b.label.destroy();
    this.bodies.delete(id);
    this.others.remove(id);
  }
}

const engine = await Engine.create({ parent: document.getElementById('app')!, background: '#1a1624', zoom: 1.5 });
engine.events.on('error', ({ where, error }) => console.error(where, error));
(globalThis as { engine?: Engine }).engine = engine;
await engine.scenes.replace(new Courtyard());
