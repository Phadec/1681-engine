import type { Container } from 'pixi.js';

/** Something that moves on its own for a while (a draining bar, a fling); false from `tick` once it has settled. */
export interface UiTicking {
  tick(dtMs: number): boolean;
}

/** What a widget needs from the root it sits under; the root implements it (kept apart so the two never import each other). */
export interface UiHost {
  readonly isUiHost: true;
  /** Lay out and draw on whole pixels. */
  readonly pixelPerfect: boolean;
  /** A widget became focusable or stopped being (added, removed, enabled, hidden): the focus list is stale. */
  invalidateFocus(): void;
  /** Ticks `t` every frame until it reports it has settled: only what moves costs a frame. */
  animate(t: UiTicking): void;
}

/** The root a display object sits under, if any: walked up the parents, only when laying out (never per frame). */
export function uiHostOf(obj: Container | null): UiHost | null {
  for (let c: Container | null = obj; c; c = c.parent) {
    if ((c as unknown as Partial<UiHost>).isUiHost === true) return c as unknown as UiHost;
  }
  return null;
}
