import { Container } from 'pixi.js';
import {
  Actions,
  AssetLoader,
  Engine,
  INPUT_FLAG_DASH,
  Keyboard,
  Scene,
  TilemapView,
  autotile,
  createCollisionGrid,
  createMover,
  entitiesOf,
  isTouchUi,
  levelAt,
  paintTerrain,
  stepMover,
  system,
  type CollisionGrid,
  type LdtkLevel,
  type MoverState,
  type MovementParams,
  type TileLayer,
} from '../../src';
import { FLOOR, RULES, TILE, WALL } from './rules';

/*
 * An LDtk project whose two rooms are saved in their own level files, laid side by side by the project's
 * LinearHorizontal layout. Each room's IntGrid "Walls" layer is both its collision and, through its auto-layer tiles,
 * its look; entities carry their fields. Click a cell to raise or dig out a wall: the IntGrid value changes, the cell
 * and its eight neighbours are autotiled again by the same rules `make-assets.ts` baked the file with, only the chunks
 * touched are repainted, and the collision follows. `make-assets.ts` writes the assets.
 */

type Action = 'left' | 'right' | 'up' | 'down' | 'roll';

/** What one room needs to be edited: its view, its wall layer and the autotiled tile ids behind it. */
interface Room {
  level: LdtkLevel;
  view: TilemapView;
  layer: TileLayer;
  tiles: Uint32Array;
  /** Where the room's first column sits in the world collision grid. */
  column: number;
}

class LdtkScene extends Scene {
  private readonly keyboard = new Keyboard();
  private readonly input = new Actions<Action>(this.keyboard, {
    left: ['KeyA', 'ArrowLeft', 'pad:left', 'pad:lx-'],
    right: ['KeyD', 'ArrowRight', 'pad:right', 'pad:lx+'],
    up: ['KeyW', 'ArrowUp', 'pad:up', 'pad:ly-'],
    down: ['KeyS', 'ArrowDown', 'pad:down', 'pad:ly+'],
    roll: ['Space', 'pad:a'],
  });
  private rooms: Room[] = [];
  private grid!: CollisionGrid;
  private hero!: MoverState;
  private readonly params: MovementParams = { speed: 72, dashSpeed: 210, dashSteps: 10, dashCooldownSteps: 36, canMove: true, canDash: true };
  private cleanup = (): void => {};

  override async onEnter(): Promise<void> {
    const { stage } = this.engine;
    const status = document.getElementById('status');

    const assets = new AssetLoader(stage.textures);
    assets.ldtk('dungeon', 'assets/dungeon.ldtk'); // the project, both level files, then the tileset image
    await assets.load(({ done, total }) => status && (status.textContent = `loading ${done}/${total}`));
    const project = assets.ldtkProject('dungeon');

    // every room drawn at its world position; the collision of all of them laid into one grid
    const width = project.levels.reduce((w, l) => w + l.map.width, 0);
    const height = Math.max(...project.levels.map((l) => l.map.height));
    let column = 0;
    for (const level of project.levels) {
      const holder = new Container();
      holder.zIndex = -1_000_000; // under every body, which is drawn at its y
      this.root.addChild(holder);
      const view = new TilemapView(stage, level.map, { parent: holder, x: level.worldX, y: level.worldY });
      const layer = level.map.layers.find((l): l is TileLayer => l.kind === 'tiles' && l.name === 'Walls')!;
      const walls = level.intGrids.get('Walls')!;
      const tiles = autotile({ width: walls.width, height: walls.height, cells: walls.values }, RULES);
      this.rooms.push({ level, view, layer, tiles, column });
      for (const chest of entitiesOf(level, 'Chest')) {
        const box = stage.add.rectangle(level.worldX + chest.x, level.worldY + chest.y - 5, 12, 9, 0xc08a3a);
        box.setDepth(level.worldY + chest.y);
        this.root.addChild(box);
      }
      column += level.map.width;
    }
    const solid = new Array<string>(width * height).fill('0');
    for (const room of this.rooms) {
      const walls = room.level.intGrids.get('Walls')!;
      for (let i = 0; i < walls.values.length; i++) if (walls.values[i] === WALL) solid[Math.floor(i / walls.width) * width + room.column + (i % walls.width)] = '1';
    }
    this.grid = createCollisionGrid(width, height, TILE, solid.join(''), { bodyHalfWidth: 4, bodyHalfHeight: 3 });

    // the hero stands on the Player entity's pivot, its feet
    const first = this.rooms[0]!.level;
    const start = entitiesOf(first, 'Player')[0] ?? { x: 48, y: 48 };
    this.hero = createMover(first.worldX + start.x, first.worldY + start.y - 3);
    const body = stage.add.rectangle(this.hero.x, this.hero.y, 8, 12, 0xd8d0e8).setOrigin(0.5, 1);
    this.root.addChild(body);
    stage.cameras.main.setBounds(0, 0, width * TILE, height * TILE);
    stage.cameras.main.track(body, { lerp: 0.15, deadzoneWidth: 24, deadzoneHeight: 16, offsetY: -8 });

    this.world.addSystem(
      system('move', 'fixed', () => {
        this.input.poll();
        const [x, y] = this.input.vector('left', 'right', 'up', 'down');
        stepMover(this.hero, [x, y, this.input.pressed('roll') ? INPUT_FLAG_DASH : 0], this.params, this.grid);
        this.input.endStep();
      }),
    );
    this.world.addSystem(
      system('look', 'frame', () => {
        body.position.set(Math.round(this.hero.x), Math.round(this.hero.y) + 3);
        body.setDepth(this.hero.y);
        const here = levelAt(project.levels, this.hero.x, this.hero.y);
        const chest = here && entitiesOf(here, 'Chest')[0];
        if (status && here) status.textContent = `${here.fields.title} · chest: ${chest?.fields.gold ?? 0} gold, "${chest?.fields.note}" · click a cell to raise or dig a wall`;
      }),
    );

    const canvas = this.engine.app.canvas;
    const onDown = (e: PointerEvent) => {
      const cam = stage.cameras.main;
      const r = canvas.getBoundingClientRect();
      this.toggle(cam.scrollX + (e.clientX - r.left) / cam.zoom, cam.scrollY + (e.clientY - r.top) / cam.zoom);
    };
    canvas.addEventListener('pointerdown', onDown);
    this.cleanup = () => canvas.removeEventListener('pointerdown', onDown);
    if (isTouchUi() && status) status.textContent = 'tap a cell to raise or dig a wall';
  }

  /** Flips the wall at world point (x, y), retiles round it and repaints only what changed. */
  private toggle(x: number, y: number): void {
    const room = this.rooms.find((r) => r.level === levelAt(this.rooms.map((q) => q.level), x, y));
    if (!room) return;
    const { level } = room;
    const cx = Math.floor((x - level.worldX) / TILE);
    const cy = Math.floor((y - level.worldY) / TILE);
    // never wall the hero in where it stands
    const left = (room.column + cx) * TILE;
    const top = cy * TILE;
    const { x: hx, y: hy } = this.hero;
    if (hx + 4 > left && hx - 4 < left + TILE && hy + 3 > top && hy - 3 < top + TILE) return;
    const walls = level.intGrids.get('Walls')!;
    const i = cy * walls.width + cx;
    const terrain = walls.values[i] === WALL ? FLOOR : WALL;
    const changed = paintTerrain({ width: walls.width, height: walls.height, cells: walls.values }, RULES, room.tiles, cx, cy, terrain);
    const firstGid = level.map.tilesets[0]!.firstGid;
    for (const c of changed) room.layer.data[c] = firstGid + room.tiles[c]!;
    room.view.refreshTiles('Walls', changed);
    this.grid.solid[cy * this.grid.width + room.column + cx] = terrain === WALL ? 1 : 0;
  }

  override update(): void {
    for (const room of this.rooms) room.view.update();
  }

  override onExit(): void {
    this.cleanup();
    this.keyboard.destroy();
    for (const room of this.rooms) room.view.destroy();
  }
}

const engine = await Engine.create({ pixelPerfect: true, parent: document.getElementById('app')!, background: '#1b1622', zoom: 3 });
engine.events.on('error', ({ where, error }) => console.error(where, error));
(globalThis as { engine?: Engine }).engine = engine;
await engine.scenes.replace(new LdtkScene());
