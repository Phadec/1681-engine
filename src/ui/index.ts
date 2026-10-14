/**
 * 1681 Engine's UI module (`1681-engine/ui`): canvas widgets drawn with Pixi on the stage's screen layer, a
 * bridge for a UI written in the DOM or React over the canvas, and the pure layout maths both use. A game that
 * draws no UI through the engine never ships it.
 */

// ── Layout maths: pure, framework-free (a React kit uses them too) ─────────────────────────────────────────────────
export { insets, snapPx, snapRect, clamp, type Size, type Point, type Rect, type Insets } from './layout/geometry';
export { stackLayout, type StackOptions, type StackResult, type StackDirection, type StackAlign } from './layout/stack';
export { anchorPosition, type ScreenAnchor } from './layout/anchor';
export { fitToViewport, type FitOptions, type FitResult } from './layout/fitToViewport';
export { placeTooltip, type TooltipOptions, type TooltipPlacement, type TipSide } from './layout/placeTooltip';
export { wrapRow } from './layout/wrapRow';
export { listWidth, type ListWidthOptions } from './layout/listWidth';
export { maxScroll, clampScroll, scrollIntoView, stepFling, FLING_STOP } from './layout/scroll';
export { quantize, sliderFraction, sliderValueAt } from './layout/slider';
export { drainState, setDrainValue, stepDrain, type DrainState, type DrainOptions } from './layout/barDrain';
export { nextFocus, firstFocus, linearFocus, type NavDirection } from './layout/focusNav';

// ── Canvas widgets ─────────────────────────────────────────────────────────────────────────────────────────────────
export { UiRoot, type UiRootOptions, type UiModal } from './UiRoot';
export { uiHostOf, type UiHost, type UiTicking } from './UiHost';
export { UiPointerGate } from './UiPointerGate';
export { FocusManager, DEFAULT_NAV, type NavBindings, type NavInput } from './FocusManager';
export { Widget, sizeOf } from './Widget';
export { Panel, type PanelSkin, type TextureSkin, type ColourSkin, type PanelOptions } from './Panel';
export { Label, type LabelText } from './Label';
export { Button, type ButtonOptions, type ButtonSkin, type ButtonState } from './Button';
export { Bar, type BarOptions } from './Bar';
export { Slider, type SliderOptions } from './Slider';
export { Toggle, type ToggleOptions } from './Toggle';
export { Stack } from './Stack';
export { ScrollView, type ScrollViewOptions } from './ScrollView';
export { List, type ListOptions } from './List';
export { Dialog, type DialogOptions } from './Dialog';

// ── DOM / React bridge ─────────────────────────────────────────────────────────────────────────────────────────────
export { DomOverlay, type DomOverlayOptions } from './dom/DomOverlay';
export { DomWorldAnchors, type WorldAnchorOptions, type WorldPoint } from './dom/DomWorldAnchors';
export { worldToScreen, onScreen, type LayerTransform } from './dom/worldToScreen';
export { createStore, type Store, type StoreListener } from './dom/createStore';
export { InputShield } from './dom/InputShield';
export { shouldShield, isEditable, isInside, type ShieldFacts, type ShieldOptions, type ElementLike } from './dom/shieldDecision';
