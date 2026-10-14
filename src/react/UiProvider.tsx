import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { isTouchUi } from '../platform/touch';
import type { Size } from '../ui/layout/geometry';
import { classJoiner, type ClassJoiner } from './classNames';
import { DEFAULT_LABELS, type UiLabels } from './labels';

/** What every component of the kit reads: where it is, how big the screen is and the words it prints. */
export interface UiSettings {
  /** Fingers, not a mouse: windows become full-screen sheets, tooltips are not shown. Default: `isTouchUi()`. */
  touch: boolean;
  /**
   * The scale windows and dialogs are meant to be drawn at (`fitToViewport`'s `scale`): a whole multiple for a
   * pixel-art UI laid out on small units. Default 1.
   */
  scale: number;
  /** The smallest scale a window may shrink to before its body scrolls instead (default: `scale`, never shrinks). */
  minScale: number;
  /** A player's "window size" for touch sheets: laid out on a box `1 / sheetScale` the screen and drawn back down. */
  sheetScale: number;
  /** Kept clear between a window and the screen's edges (default 8). */
  margin: number;
  /** Positions and sizes land on whole pixels (default true): pixel art at x.5 reads blurred. */
  snap: boolean;
  labels: UiLabels;
  /** The box windows, tooltips and lists are placed in. Default: the browser window. */
  viewport: () => Size;
  /** Where tooltips, the select's list and dialogs are portalled. Default: `document.body`. */
  portal: () => HTMLElement | null;
  /**
   * A game's own class names hung beside the kit's, keyed by the kit's name without its prefix (`tabs`, `tab`,
   * `button`, `select-list`…) or by a state (`picked`, `open`): a game whose stylesheet already styles its own names
   * takes the kit without rewriting it. Default none.
   */
  classNames: Readonly<Record<string, string>>;
  /** Joins class names, adding the game's beside each of the kit's (`classNames`); what every component calls. */
  cx: ClassJoiner;
}

export interface UiProviderProps extends Partial<Omit<UiSettings, 'labels' | 'cx'>> {
  labels?: Partial<UiLabels>;
  children?: ReactNode;
}

const NO_CLASSES: Readonly<Record<string, string>> = {};

function windowSize(): Size {
  return typeof window === 'undefined' ? { width: 0, height: 0 } : { width: window.innerWidth, height: window.innerHeight };
}

function body(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.body;
}

/** The settings a component sees with no `UiProvider` above it. */
export function defaultUiSettings(): UiSettings {
  return { touch: isTouchUi(), scale: 1, minScale: 1, sheetScale: 1, margin: 8, snap: true, labels: DEFAULT_LABELS, viewport: windowSize, portal: body, classNames: NO_CLASSES, cx: classJoiner(NO_CLASSES) };
}

const UiContext = createContext<UiSettings | null>(null);

/**
 * Optional: sets the touch mode, the window scale, the words and the box to place things in for every component
 * below it. A UI mounted in a `DomOverlay` passes the overlay's content size as `viewport` and the overlay's
 * content as `portal`, so tooltips and lists land inside its scaled box.
 */
export function UiProvider({ children, labels, touch, scale, minScale, sheetScale, margin, snap, viewport, portal, classNames }: UiProviderProps) {
  const outer = useContext(UiContext);
  const value = useMemo<UiSettings>(() => {
    const base = outer ?? defaultUiSettings();
    const s = scale ?? base.scale;
    const classes = classNames ? { ...base.classNames, ...classNames } : base.classNames;
    return {
      touch: touch ?? base.touch,
      scale: s,
      minScale: minScale ?? Math.min(base.minScale, s),
      sheetScale: sheetScale ?? base.sheetScale,
      margin: margin ?? base.margin,
      snap: snap ?? base.snap,
      labels: labels ? { ...base.labels, ...labels } : base.labels,
      viewport: viewport ?? base.viewport,
      portal: portal ?? base.portal,
      classNames: classes,
      cx: classes === base.classNames ? base.cx : classJoiner(classes),
    };
  }, [outer, labels, touch, scale, minScale, sheetScale, margin, snap, viewport, portal, classNames]);
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

let fallback: UiSettings | null = null;

/** The kit's settings: the nearest `UiProvider`'s, or the defaults. */
export function useUi(): UiSettings {
  const ui = useContext(UiContext);
  if (ui) return ui;
  fallback ??= defaultUiSettings();
  return fallback;
}

/** The class joiner of the nearest `UiProvider` (`UiSettings.cx`). */
export function useCx(): ClassJoiner {
  return useUi().cx;
}
