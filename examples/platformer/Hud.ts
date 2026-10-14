import type { Container } from 'pixi.js';
import type { Stage, Translator } from '../../src';
import { Bar, Label, Panel, Stack, UiRoot } from '../../src/ui';
import { formatTime } from './Progress';
import { FONT, HUD_BACK } from './uiSkin';

/**
 * The level's heads-up display on the canvas: a coin counter over a bar of the level's coins in the top-left
 * corner, the clock in the top-right, and the "level clear" line in the middle when it comes. Pinned to the screen's
 * corners by the `UiRoot`, so a resize keeps them there.
 */
export class Hud {
  readonly ui: UiRoot;
  private readonly coins = Label.text('', FONT);
  private readonly bar = new Bar({ width: 120, height: 6, color: 0xf6c945, value: 0, backColor: 0x2a2340, backAlpha: 1, trailColor: 0xfff0a0 });
  /** Rewritten every frame, so a bitmap label: a canvas `Text` would repaint and upload a texture each time. */
  private readonly clock = Label.bitmap('', 'monospace', 16, '#efe6ff', '#14101c', 3);
  private readonly banner = Label.text('', { ...FONT, fontSize: 24, color: '#ffd98a' });
  private readonly left: Stack;
  private readonly back: Panel;
  private readonly stopLanguage: () => void;
  private taken = 0;
  private ms = 0;

  /** `parent`: the scene's `hud`, so the UI goes when the scene does. */
  constructor(
    stage: Stage,
    parent: Container,
    private readonly translator: Translator,
    private readonly total: number,
  ) {
    this.ui = new UiRoot(stage, { parent });
    this.left = new Stack({ gap: 4, padding: 6 }).add(this.coins, this.bar);
    this.back = new Panel(HUD_BACK, this.left.boxWidth, this.left.boxHeight, { blocksPointer: false });
    this.back.addChild(this.left);
    this.ui.pin(this.back, 'top-left', 8);
    this.ui.pin(this.clock, 'top-right', 10);
    this.banner.visible = false;
    this.ui.pin(this.banner, 'center');
    this.stopLanguage = translator.subscribe(() => this.refresh());
    this.refresh();
  }

  setCoins(taken: number): void {
    this.taken = taken;
    // the bar fills toward the level's coins; it is a progress bar here, so no trail
    this.bar.setValue(this.total ? taken / this.total : 0, true);
    this.refresh();
  }

  setTime(ms: number): void {
    this.ms = ms;
    const width = this.clock.boxWidth;
    this.clock.setText(this.translator.tr('Time {0}', formatTime(ms)));
    // pinned to the right edge: a wider text must be placed again, or it runs off the screen
    if (this.clock.boxWidth !== width) this.ui.layout();
  }

  showBanner(text: string): void {
    this.banner.setText(text);
    this.banner.visible = true;
    this.ui.layout();
  }

  /** Stops listening to the language; the UI itself is the scene's and goes with it. */
  destroy(): void {
    this.stopLanguage();
  }

  private refresh(): void {
    const { tr } = this.translator;
    this.coins.setText(tr('Coins {0}/{1}', this.taken, this.total));
    this.setTime(this.ms);
    // a longer translation widens the panel: lay the stack and the panel out again, then the pins
    this.left.layout();
    this.back.resize(this.left.boxWidth, this.left.boxHeight);
    this.ui.layout();
  }
}
