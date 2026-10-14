import { Actions, Image, Keyboard, Scene } from '../../src';
import { Label, Stack, UiRoot } from '../../src/ui';
import { GROUND, HERO, HERO_FRAMES } from './art';
import { Backdrop } from './Backdrop';
import { UI_BINDINGS, type UiAction } from './Controls';
import type { ClearResult, Game } from './Game';
import { LEVEL_PX_H, LEVEL_PX_W } from './level';
import { formatTime } from './Progress';
import { LANGUAGE_NAMES } from './strings';
import { TextButton } from './TextButton';
import { FONT, SMALL, TITLE } from './uiSkin';

/**
 * The title: the level's own scenery drifting past behind a menu with the records from the save. Start and the
 * language are buttons, reached by mouse, keyboard or gamepad; the camera pans on its own.
 */
export class TitleScene extends Scene {
  private readonly keyboard = new Keyboard();
  private readonly input = new Actions<UiAction>(this.keyboard, UI_BINDINGS);
  private readonly backdrop = new Backdrop();
  private ui!: UiRoot;
  private column!: Stack;
  private best!: Label;
  private total!: Label;
  private result!: Label;
  private start!: TextButton;
  private language!: TextButton;
  private hints!: Label[];
  private stopLanguage: (() => void) | null = null;

  constructor(
    private readonly game: Game,
    private readonly cleared?: ClearResult,
  ) {
    super();
  }

  override onEnter(): void {
    const { stage } = this.engine;
    this.root.addChild(this.backdrop.view, new Image(stage.textures, 0, 0, GROUND).setOrigin(0, 0).setDepth(-10));
    // the hero waits at the start, where the level will put it
    this.root.addChild(new Image(stage.textures, 40, 160, HERO.key, HERO_FRAMES.idle).setOrigin(0.5, 1));
    // the engine reset the camera for this scene (a replace does): only this scene's bounds and view to set
    stage.cameras.main.setBounds(0, 0, LEVEL_PX_W, LEVEL_PX_H).setScroll(0, LEVEL_PX_H);

    this.ui = new UiRoot(stage, { parent: this.hud });
    const width = 260;
    this.result = Label.text(' ', { ...FONT, color: '#a8e070' });
    this.best = Label.text(' ', FONT);
    this.total = Label.text(' ', SMALL);
    this.start = new TextButton(' ', width, () => this.game.startLevel());
    this.language = new TextButton(' ', width, () => this.game.cycleLanguage());
    this.hints = [Label.text(' ', SMALL), Label.text(' ', SMALL)];
    this.result.visible = this.cleared !== undefined;
    this.column = new Stack({ gap: 10, align: 'center' }).add(Label.text('Hilltop Courier', TITLE), this.result, this.best, this.total, this.start, this.language, ...this.hints);
    this.ui.pin(this.column, 'center');
    this.ui.focus.focus(this.start);
    this.stopLanguage = this.game.translator.subscribe(() => this.refresh());
    this.refresh();
  }

  override onExit(): void {
    this.stopLanguage?.();
    this.keyboard.destroy();
  }

  override fixedUpdate(): void {
    this.input.poll();
    if (!this.game.busy) this.ui.handleInput(this.input);
    this.input.endStep();
  }

  override update(): void {
    // a slow pan to the flag and back, about a minute each way
    const camera = this.engine.stage.cameras.main;
    const span = LEVEL_PX_W - camera.worldView.width;
    const t = (Math.sin(performance.now() / 20000) + 1) / 2;
    camera.setScroll(Math.round(t * Math.max(0, span)), LEVEL_PX_H);
    this.backdrop.update(camera);
  }

  private refresh(): void {
    const { tr, trn } = this.game.translator;
    const data = this.game.progress.data;
    if (this.cleared) this.result.setText(`${tr('Level clear! {0}', formatTime(this.cleared.ms))}${this.cleared.best ? ' ★' : ''}`);
    this.best.setText(data.bestMs === null ? tr('No best time yet') : tr('Best time: {0}', formatTime(data.bestMs)));
    this.total.setText(trn('{0} coin collected in all', '{0} coins collected in all', data.totalCoins));
    this.start.setText(tr('Start|game'));
    this.language.setText(LANGUAGE_NAMES[this.game.translator.language] ?? this.game.translator.language);
    this.hints[0]!.setText(tr('Arrows / WASD to run · {0} to jump · Down + jump drops through planks', this.game.controls.jumpLabel()));
    this.hints[1]!.setText(tr('Esc pauses · F3 shows the physics'));
    this.column.layout();
    this.ui.layout();
  }
}
