import { Actions, Keyboard, Scene, engineSettings } from '../../src';
import { Dialog, Label, Slider, Stack, UiRoot } from '../../src/ui';
import { UI_BINDINGS, type PlayAction, type UiAction } from './Controls';
import type { Game } from './Game';
import { LANGUAGE_NAMES } from './strings';
import { TextButton } from './TextButton';
import { FONT, SLIDER, SMALL, WINDOW } from './uiSkin';

const WIDTH = 330;
const PAD = 16;

/**
 * The pause menu, pushed over the level: the level below stops updating (only the top scene does) but stays drawn,
 * dimmed by the dialog. Resume, restart, the language, the sound volume and the jump key, all reachable with the
 * mouse, the keyboard (arrows, Enter, Esc, Tab) or a gamepad (d-pad or stick, A, B or Start).
 */
export class PauseScene extends Scene {
  private readonly keyboard = new Keyboard();
  private readonly input = new Actions<UiAction>(this.keyboard, UI_BINDINGS);
  private ui!: UiRoot;
  private dialog!: Dialog;
  private title!: Label;
  private resume!: TextButton;
  private restart!: TextButton;
  private language!: TextButton;
  private volumeLabel!: Label;
  private volume!: Slider;
  private jump!: TextButton;
  private hint!: Label;
  private body!: Stack;
  private volumeRow!: Stack;
  private stopLanguage: (() => void) | null = null;
  /** Waiting for the key to put on Jump: the next keydown is the player's choice, not a menu press. */
  private rebinding = false;
  private leaving = false;

  constructor(private readonly game: Game) {
    super();
  }

  override onEnter(): void {
    // under the scene's hud: the menu's UI goes when the scene pops
    this.ui = new UiRoot(this.engine.stage, { parent: this.hud });
    this.title = Label.text(' ', { ...FONT, fontSize: 24, color: '#ffd98a' });
    this.resume = new TextButton('', WIDTH - 2 * PAD, () => this.dialog.close());
    this.restart = new TextButton('', WIDTH - 2 * PAD, () => {
      this.leaving = true;
      this.game.startLevel('down');
    });
    this.language = new TextButton('', WIDTH - 2 * PAD, () => this.game.cycleLanguage());
    this.volumeLabel = Label.text(' ', FONT);
    this.volume = new Slider({
      ...SLIDER,
      width: 150,
      height: 14,
      step: 0.05,
      value: engineSettings.getState().sfxVolume,
      // the engine's sound reads its volume from the engine settings; a game mirrors its own setting there
      onChange: (v) => engineSettings.set({ sfxVolume: v }),
    });
    this.volumeRow = new Stack({ direction: 'horizontal', gap: 10, align: 'center' }).add(this.volumeLabel, this.volume);
    this.jump = new TextButton('', WIDTH - 2 * PAD, () => this.startRebind());
    this.hint = Label.text(' ', SMALL);
    const body = new Stack({ gap: 8, align: 'center', crossSize: WIDTH - 2 * PAD }).add(this.title, this.resume, this.restart, this.language, this.volumeRow, this.jump, this.hint);
    this.body = body;
    // no height: the dialog takes the column's, padding included
    this.dialog = new Dialog({
      width: WIDTH,
      frame: WINDOW,
      content: body,
      padding: PAD,
      onClose: () => {
        if (!this.leaving) void this.engine.scenes.pop();
      },
    });
    this.dialog.open(this.ui);
    this.ui.focus.focus(this.resume);
    this.stopLanguage = this.game.translator.subscribe(() => this.refresh());
    this.refresh();
  }

  override onExit(): void {
    this.stopLanguage?.();
    this.endRebind();
    this.keyboard.destroy();
  }

  override fixedUpdate(): void {
    this.input.poll();
    if (!this.leaving && !this.rebinding && !this.game.busy) this.ui.handleInput(this.input);
    this.input.endStep();
  }

  private refresh(): void {
    const { tr } = this.game;
    this.title.setText(tr('Paused'));
    this.resume.setText(tr('Resume'));
    this.restart.setText(tr('Restart'));
    this.language.setText(tr('Language: {0}', LANGUAGE_NAMES[this.game.translator.language] ?? this.game.translator.language));
    this.jump.setText(tr('Jump key: {0}', this.rebinding ? '…' : this.game.controls.jumpLabel()));
    this.volumeLabel.setText(tr('Volume|sound'));
    this.volumeRow.layout();
    // the whole column again: a translation may be wider or narrower than what it replaced
    this.body.layout();
    this.ui.layout();
  }

  private say(text: string): void {
    this.hint.setText(text);
    this.body.layout();
    this.ui.layout();
  }

  private startRebind(): void {
    if (this.rebinding) return;
    this.rebinding = true;
    this.say(this.game.tr('Press a key… (Esc cancels)'));
    this.refresh();
    // capture, and stop the event there: neither the menu's keyboard nor the level's sees the key being chosen
    window.addEventListener('keydown', this.onRebindKey, { capture: true });
  }

  private readonly onRebindKey = (e: KeyboardEvent): void => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    const { tr } = this.game;
    if (e.code !== 'Escape') {
      const keymap = this.game.controls.keymap;
      const lost = keymap.bind('jump', e.code);
      if (lost === null) {
        this.say(tr('Escape, Enter and Tab are kept for menus'));
        return;
      }
      this.say(lost.length ? tr('That key was taken from: {0}', lost.map((a: PlayAction) => tr(`${a}|action`)).join(', ')) : ' ');
    } else this.say(' ');
    this.endRebind();
    this.refresh();
  };

  private endRebind(): void {
    this.rebinding = false;
    window.removeEventListener('keydown', this.onRebindKey, { capture: true });
  }
}
