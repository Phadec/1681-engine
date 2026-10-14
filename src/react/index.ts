/**
 * 1681 Engine's React kit (`1681-engine/react`): the windows, tabs, lists, drop-downs, tooltips, dialogs and sliders
 * a game's DOM UI is built from, laid out by the engine's own layout maths (`fitToViewport`, `placeTooltip`,
 * `listWidth`) and themed by CSS custom properties (`baseCss`). React and React DOM are optional peer dependencies:
 * only a game that imports this entry needs them, and the core and `1681-engine/ui` never import React.
 *
 * Every word on screen is the game's: a prop, or `UiProvider`'s `labels`, with an English default.
 */

// ── Setup ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export { UiProvider, useUi, useCx, defaultUiSettings, type UiSettings, type UiProviderProps } from './UiProvider';
export { classJoiner, type ClassJoiner } from './classNames';
export { DEFAULT_LABELS, fillLabel, type UiLabels } from './labels';
export { baseCss, injectBaseCss } from './baseCss';
export { useStore } from './useStore';
export { useJsonSelector, useStoreJson, type SelectingHook } from './useJsonSelector';
export { useViewport } from './useViewport';
export { useFitToViewport, SCROLL_CLASS, type FitTarget } from './useFitToViewport';
export { useFillSheet } from './useFillSheet';

// ── Pure layout decisions ──────────────────────────────────────────────────────────────────────────────────────────
export {
  windowStyle,
  sheetScaleStyle,
  cursorTip,
  listPlacement,
  pixelFit,
  splitModeFor,
  SPLIT_STACK_BELOW,
  type CursorTipOptions,
  type ListPlacement,
} from './placement';

// ── Components ─────────────────────────────────────────────────────────────────────────────────────────────────────
export { Panel, type PanelProps } from './Panel';
export { TabStrip, type Tab, type TabStripProps } from './TabStrip';
export { SplitPane, type SplitPaneProps } from './SplitPane';
export { usePicked, pickedEntry } from './usePicked';
export { Select, stepOption, type SelectOption, type SelectProps } from './Select';
export { Tooltip, type TooltipProps } from './Tooltip';
export { TitleTips, type TitleTipsProps } from './TitleTips';
export { Modal, type ModalProps } from './Modal';
export { ConfirmDialog } from './ConfirmDialog';
export { ConfirmButton, type ConfirmButtonProps } from './ConfirmButton';
export { askConfirm, askQuantity, answerConfirm, cancelConfirm, confirmStore, parseQuantity, type AskOptions, type ConfirmQuestion } from './confirmStore';
export { ChoiceDialog } from './ChoiceDialog';
export { askChoice, answerChoice, cancelChoice, choiceStore, firstChoice, type ChoiceOption, type ChoiceQuestion } from './choiceStore';
export { Slider, sliderKeyValue, type SliderProps } from './Slider';
export { PixelImage, type PixelImageProps } from './PixelImage';
export { Glyph, registerGlyph, hasGlyph, glyphPath, type GlyphId, type BuiltInGlyph, type GlyphArt, type GlyphProps } from './Glyph';
