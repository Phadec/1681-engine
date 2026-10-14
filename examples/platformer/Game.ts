import { DitherWipeTransition, FadeTransition, transitionTo, type BoxDrawer, type Engine, type Scene, type Translator } from '../../src';
import { Controls } from './Controls';
import { Progress } from './Progress';
import { createTranslator } from './strings';

/** How a run ended, for the title screen to report. */
export interface ClearResult {
  ms: number;
  coins: number;
  /** A new best time. */
  best: boolean;
}

/** The scenes the game moves between, made fresh each time; set by `main.ts` so scenes never import each other. */
export interface SceneFactory {
  title(result?: ClearResult): Scene;
  level(): Scene;
}

/**
 * What lives as long as the page and every scene shares: the engine, the save, the key bindings, the language, and
 * the ways from one scene to the next. Scenes come and go; they are handed this rather than reaching for globals.
 */
export class Game {
  readonly controls = new Controls();
  readonly translator: Translator;
  /** The running level's collider drawing, or null off the level: the debug overlay asks for it each shown frame. */
  debugBoxes: ((draw: BoxDrawer) => void) | null = null;
  private moving = false;

  constructor(
    readonly engine: Engine,
    readonly progress: Progress,
    private readonly scenes: SceneFactory,
  ) {
    this.translator = createTranslator(progress.data.language);
  }

  get tr(): Translator['tr'] {
    return this.translator.tr;
  }

  /** The next language in the list, remembered in the save. */
  cycleLanguage(): void {
    const all = this.translator.languages;
    const next = all[(all.indexOf(this.translator.language) + 1) % all.length]!;
    this.translator.setLanguage(next);
    this.progress.setLanguage(next);
  }

  /** Into the level (from the title, or again from the pause menu) behind a dithered wipe. */
  startLevel(direction: 'right' | 'down' = 'right'): void {
    this.go(this.scenes.level(), new DitherWipeTransition({ color: 0x14101c, duration: 380, direction }));
  }

  /** Back to the title after a clear, which it records. */
  toTitle(run?: { ms: number; coins: number }): void {
    const result = run && { ...run, best: this.progress.recordClear(run.ms, run.coins) };
    this.go(this.scenes.title(result), new FadeTransition({ color: 0x14101c, duration: 350, hold: 120 }));
  }

  /** Whether a scene change is under way: buttons pressed twice during a wipe must not start two. */
  get busy(): boolean {
    return this.moving;
  }

  private go(next: Scene, transition: DitherWipeTransition | FadeTransition): void {
    if (this.moving) return;
    this.moving = true;
    transitionTo(this.engine, next, transition)
      .catch((err) => this.engine.reportError('transition', err))
      .finally(() => (this.moving = false));
  }
}
