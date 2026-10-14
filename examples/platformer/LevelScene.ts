import {
  Body,
  ColorGrade,
  Image,
  Keyboard,
  PhysicsWorld,
  Scene,
  drawColliders,
  mergeTileRects,
  physicsSystem,
  sound,
  syncToBody,
  system,
  tileBodies,
  type Actions,
  type Contact,
} from '../../src';
import { COIN, CRATE, FLAG, GROUND, PLATFORM } from './art';
import { Backdrop } from './Backdrop';
import type { PlayAction } from './Controls';
import { Effects } from './Effects';
import type { Game } from './Game';
import { Hero, LAYER } from './Hero';
import { Hud } from './Hud';
import { LEVEL_H, LEVEL_PX_H, LEVEL_PX_W, LEVEL_W, PLATFORM_TILES, PLATFORM_TRAVEL, TILE, readLevel } from './level';
import { PauseScene } from './PauseScene';
import { formatTime } from './Progress';

const PLATFORM_SPEED = 36;
/** Seconds the "level clear" line shows before the way back to the title. */
const CLEAR_HOLD = 1.6;

interface Coin {
  body: Body;
  view: Image;
  phase: number;
}

/**
 * The level: a physics world built from the tile rows, a hero on it, crates, a moving platform, one-way planks,
 * coins and a goal, with the HUD, particles and the sky around them. Pausing pushes `PauseScene` over it, so this
 * scene simply stops updating underneath — no "paused" flag threads through its systems.
 */
export class LevelScene extends Scene {
  private readonly keyboard = new Keyboard();
  private readonly physics = new PhysicsWorld({ gravityY: 1300 });
  private readonly coins: Coin[] = [];
  private readonly crates: { body: Body; view: Image }[] = [];
  private readonly cleanup: (() => void)[] = [];
  private actions!: Actions<PlayAction>;
  private hero!: Hero;
  private platform!: { body: Body; view: Image; minX: number; maxX: number };
  private flag!: Image;
  private display!: Hud;
  private effects!: Effects;
  private backdrop!: Backdrop;
  private grade!: ColorGrade;
  /** What the camera follows: the hero as drawn this frame, a little above its feet. */
  private readonly focus = { x: 0, y: 0 };
  private taken = 0;
  private elapsed = 0;
  /** The clock starts on the first move, not while the wipe is still uncovering the level. */
  private started = false;
  private clearLeft = -1;

  constructor(private readonly game: Game) {
    super();
  }

  override onEnter(): void {
    const { stage } = this.engine;
    const level = readLevel();
    const textures = stage.textures;

    // ── the world's bodies ──────────────────────────────────────────────────────────────────────────────────────
    // solid tiles merged into as few static boxes as cover them: a floor is one box, so nothing snags on seams
    this.add(...tileBodies(LEVEL_W, LEVEL_H, TILE, level.solid, { friction: 0.8, layer: LAYER.world }));
    // one-way planks: each run of '-' one thin box along the top of its tiles, tagged for the pre-solve below
    for (const r of mergeTileRects(LEVEL_W, LEVEL_H, level.oneWay)) {
      const w = (r.x1 - r.x0 + 1) * TILE;
      this.add(new Body({ type: 'static', shape: { kind: 'box', halfWidth: w / 2, halfHeight: 2 }, x: r.x0 * TILE + w / 2, y: r.y0 * TILE + 2, layer: LAYER.world, userData: 'one-way' }));
    }
    const p = level.platforms[0]!;
    const half = (PLATFORM_TILES * TILE) / 2;
    const platformBody = this.add(
      new Body({ type: 'kinematic', shape: { kind: 'box', halfWidth: half, halfHeight: 4 }, x: p.tx * TILE + half, y: p.ty * TILE + 4, vx: PLATFORM_SPEED, friction: 1, layer: LAYER.world, userData: 'platform' }),
    );
    this.platform = { body: platformBody, view: this.sprite(new Image(textures, 0, 0, PLATFORM.key, 0)), minX: platformBody.x, maxX: platformBody.x + PLATFORM_TRAVEL * TILE };
    for (const c of level.crates) {
      const body = this.add(new Body({ shape: { kind: 'box', halfWidth: 7, halfHeight: 7 }, x: c.tx * TILE + 8, y: c.ty * TILE + 9, mass: 2, friction: 0.4, layer: LAYER.crate, mask: LAYER.world | LAYER.hero | LAYER.crate }));
      this.crates.push({ body, view: this.sprite(new Image(textures, 0, 0, CRATE.key, 0)) });
    }
    for (const c of level.coins) {
      // sensors: they report the hero passing through and push nothing; the mask means only the hero is noticed
      const body = this.add(new Body({ type: 'static', sensor: true, shape: { kind: 'circle', radius: 5 }, x: c.tx * TILE + 8, y: c.ty * TILE + 8, layer: LAYER.pickup, mask: LAYER.hero, userData: 'coin' }));
      this.coins.push({ body, view: this.sprite(new Image(textures, body.x, body.y, COIN.key, 0)), phase: c.tx * 0.7 });
    }
    const g = level.goal;
    this.add(new Body({ type: 'static', sensor: true, shape: { kind: 'box', halfWidth: 5, halfHeight: 12 }, x: g.tx * TILE + 8, y: g.ty * TILE + 4, layer: LAYER.pickup, mask: LAYER.hero, userData: 'goal' }));
    this.flag = this.sprite(new Image(textures, g.tx * TILE + 8, (g.ty + 1) * TILE, FLAG.key, 0).setOrigin(0.5, 1));
    this.hero = new Hero(stage, level.start.tx * TILE + 8, (level.start.ty + 1) * TILE - 7);
    this.add(this.hero.body);
    this.root.addChild(this.hero.view.setDepth(40));
    this.root.addChild(new Image(textures, 0, 0, GROUND).setOrigin(0, 0).setDepth(-10));

    this.physics.preSolve = (c) => this.oneWay(c);
    this.cleanup.push(this.physics.events.on('begin', ({ a, b }) => this.touched(a === this.hero.body ? b : b === this.hero.body ? a : null)));

    // ── input, then physics, then what follows from it: three fixed systems, in that order ───────────────────────
    const { actions, stop } = this.game.controls.playActions(this.keyboard);
    // registered with the scene: presses made in the pause menu are flushed before the level reads its input again
    this.actions = this.useInput(actions);
    this.cleanup.push(stop);
    this.world.addSystem(system('control', 'fixed', ({ dt }) => this.control(dt)));
    this.world.addSystem(physicsSystem(this.physics));
    this.world.addSystem(system('aftermath', 'fixed', ({ dt }) => this.aftermath(dt)));

    // ── around the level: sky, grade, particles, HUD, camera, debug ─────────────────────────────────────────────
    this.backdrop = new Backdrop();
    this.root.addChild(this.backdrop.view);
    // at the bottom of the screen layer: it tints the world and never the HUD, whichever is made first
    this.grade = new ColorGrade(
      stage,
      () => {
        const day = this.backdrop.now();
        return { color: day.color, alpha: day.alpha };
      },
      { placement: 'bottom' },
    );
    this.effects = new Effects(stage, this.root);
    this.display = new Hud(stage, this.hud, this.game.translator, this.coins.length);
    this.display.setCoins(0);
    // the camera was reset when this scene replaced the last one; the target and bounds go again when the next does
    const camera = stage.cameras.main;
    camera.setBounds(0, 0, LEVEL_PX_W, LEVEL_PX_H);
    this.focus.x = this.hero.body.x;
    this.focus.y = this.hero.body.y;
    camera.track(this.focus, { lerp: 0.18, deadzoneWidth: 24, deadzoneHeight: 32, offsetY: -8 });
    // every body by kind (static green, moving cyan, dynamic yellow standing and red in the air, sensors pink), the
    // one-way planks orange
    this.game.debugBoxes = (draw) => drawColliders(this.physics, draw, {}, (b) => (b.userData === 'one-way' ? 0xffa040 : undefined));
  }

  override onExit(): void {
    for (const fn of this.cleanup.splice(0)) fn();
    this.game.debugBoxes = null;
    this.effects.destroy();
    this.grade.destroy();
    this.display.destroy();
    this.keyboard.destroy();
    this.physics.events.clear();
    // coins taken on a run that never reached the flag still count toward the total
    this.game.progress.save();
  }

  override update(dt: number, alpha: number): void {
    const now = performance.now();
    this.hero.draw(alpha, dt);
    syncToBody(this.focus, this.hero.body, alpha);
    syncToBody(this.platform.view, this.platform.body, alpha, 0, 0, true);
    for (const c of this.crates) syncToBody(c.view, c.body, alpha, 0, 0, true);
    for (const c of this.coins) c.view.setFrame(Math.floor(now / 110 + c.phase) % COIN.frames);
    this.flag.setFrame(Math.floor(now / 300) % FLAG.frames);
    const running = this.hero.grounded && Math.abs(this.hero.body.vx) > 70;
    this.effects.running(running, this.hero.feetX, this.hero.feetY, this.hero.facing);
    const camera = this.engine.stage.cameras.main;
    this.effects.update(dt, camera);
    this.backdrop.update(camera);
    this.grade.update(now);
    this.display.setTime(this.elapsed * 1000);
  }

  /** Before physics: read the step's input, steer the hero, turn the platform round at its ends. */
  private control(dt: number): void {
    const a = this.actions;
    a.poll();
    if (a.pressed('pause') && this.clearLeft < 0 && !this.game.busy) void this.engine.scenes.push(new PauseScene(this.game));
    const done = this.clearLeft >= 0;
    const move = done ? 0 : a.axis('left', 'right');
    const jump = !done && a.pressed('jump');
    if (move !== 0 || jump) this.started = true;
    const jumped = this.hero.control({ move, jumpPressed: jump, jumpHeld: a.down('jump'), down: a.down('down') }, dt);
    if (jumped) sound.play('jump', { local: true });
    a.endStep();
    const p = this.platform;
    if (p.body.x >= p.maxX) p.body.setVelocity(-PLATFORM_SPEED, 0);
    else if (p.body.x <= p.minX) p.body.setVelocity(PLATFORM_SPEED, 0);
    if (this.started && !done) this.elapsed += dt;
  }

  /** After physics: landings, falling out of the world, the wait after the goal. */
  private aftermath(dt: number): void {
    const landed = this.hero.settle();
    if (landed > 120) {
      this.effects.landed(this.hero.feetX, this.hero.feetY, landed);
      sound.play('land', { local: true, gain: Math.min(1, landed / 400) });
    }
    if (this.hero.body.y > LEVEL_PX_H + 48) {
      this.hero.respawn();
      this.engine.stage.cameras.main.flash(250, 255, 255, 255, false, 0.6);
    }
    if (this.clearLeft >= 0) {
      this.clearLeft -= dt;
      if (this.clearLeft < 0) this.game.toTitle({ ms: this.elapsed * 1000, coins: this.taken });
    }
  }

  /**
   * One-way planks: a contact counts only for a body whose feet were on or above the plank when the step began, and
   * never while the hero drops through. Anything else (jumping up from below, walking in from the side) passes.
   */
  private oneWay(c: Contact): boolean {
    const plank = c.a.userData === 'one-way' ? c.a : c.b.userData === 'one-way' ? c.b : null;
    if (!plank) return true;
    const other = c.other(plank);
    if (other === this.hero.body && this.hero.dropping) return false;
    const halfH = other.shape.kind === 'box' ? other.shape.halfHeight : other.shape.radius;
    return other.prevY + halfH <= plank.minY + 1 && other.vy >= -1;
  }

  /** The hero began touching `other` (null: a contact without the hero). */
  private touched(other: Body | null): void {
    if (!other) return;
    if (other.userData === 'coin') {
      const i = this.coins.findIndex((c) => c.body === other);
      if (i < 0) return;
      const [coin] = this.coins.splice(i, 1);
      this.physics.remove(other);
      coin!.view.destroy();
      this.taken++;
      this.game.progress.addCoins(1);
      this.display.setCoins(this.taken);
      this.effects.coin(other.x, other.y);
      sound.play('coin', { local: true });
    } else if (other.userData === 'goal' && this.clearLeft < 0) {
      this.clearLeft = CLEAR_HOLD;
      this.display.showBanner(this.game.tr('Level clear! {0}', formatTime(this.elapsed * 1000)));
      sound.play('clear', { local: true });
    }
  }

  private add<T extends Body>(...bodies: T[]): T {
    for (const b of bodies) this.physics.add(b);
    return bodies[0]!;
  }

  private sprite(img: Image): Image {
    this.root.addChild(img.setDepth(20));
    return img;
  }
}
