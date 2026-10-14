/**
 * The kit's base stylesheet, as a string: `injectBaseCss()` puts it in the page once, or a game copies it into its
 * own CSS. Everything is themed by custom properties a game sets on `:root` (or any ancestor):
 *
 * | Property | What |
 * |---|---|
 * | `--e1681-font`, `--e1681-font-size` | the UI's font |
 * | `--e1681-text`, `--e1681-muted`, `--e1681-accent` | text, quiet text, the picked / lit colour |
 * | `--e1681-bg`, `--e1681-well`, `--e1681-control-bg` | a window's fill, a sunk pane's, a button's or field's |
 * | `--e1681-border`, `--e1681-border-width` | the plain border used while no frame image is given |
 * | `--e1681-frame`, `--e1681-frame-slice`, `--e1681-frame-width` | windows and dialogs: a 9-slice `border-image` (`url(…)`, `16 20 20 16 fill`, `16px 20px 20px 16px`) |
 * | `--e1681-tip-frame`, `-slice`, `-width` | tooltips and the select's list |
 * | `--e1681-control-frame`, `-slice`, `-width` | buttons, the select, text fields |
 * | `--e1681-tab-frame`, `--e1681-tab-active-frame`, `-slice`, `-width` | tabs |
 * | `--e1681-well-frame`, `-slice`, `-width` | the split pane's detail, the slider's track |
 * | `--e1681-backdrop` | behind a dialog |
 *
 * A `-width` may have one to four lengths, like `border-width`. The pixel rules hold here: no `translate(-50%)` centring and no `zoom` (the components place in whole pixels), no
 * blurred shadow, no gradient. A frame's middle shows through only when its slice says `fill`.
 */
export const baseCss = `
:root {
  --e1681-font: inherit;
  --e1681-font-size: 16px;
  --e1681-text: #ece6d6;
  --e1681-muted: #9c968a;
  --e1681-accent: #e8c060;
  --e1681-bg: #1d242e;
  --e1681-well: #131a24;
  --e1681-control-bg: #2a323e;
  --e1681-border: #6a5634;
  --e1681-border-width: 2px;
  --e1681-backdrop: rgba(0, 0, 0, 0.5);
  --e1681-frame: none;
  --e1681-frame-slice: 0;
  --e1681-frame-width: var(--e1681-border-width);
  --e1681-tip-frame: var(--e1681-frame);
  --e1681-tip-frame-slice: var(--e1681-frame-slice);
  --e1681-tip-frame-width: var(--e1681-frame-width);
  --e1681-control-frame: none;
  --e1681-control-frame-slice: 0;
  --e1681-control-frame-width: var(--e1681-border-width);
  --e1681-tab-frame: var(--e1681-control-frame);
  --e1681-tab-active-frame: var(--e1681-tab-frame);
  --e1681-tab-frame-slice: var(--e1681-control-frame-slice);
  --e1681-tab-frame-width: var(--e1681-control-frame-width);
  --e1681-well-frame: none;
  --e1681-well-frame-slice: 0;
  --e1681-well-frame-width: var(--e1681-border-width);
}

.e1681-frame {
  color: var(--e1681-text);
  font-family: var(--e1681-font);
  font-size: var(--e1681-font-size);
  background: var(--e1681-bg) padding-box;
  border-style: solid; border-color: var(--e1681-border); border-width: var(--e1681-frame-width);
  border-image: var(--e1681-frame) var(--e1681-frame-slice) / var(--e1681-frame-width) stretch;
  box-sizing: border-box;
}
.e1681-tip-frame {
  color: var(--e1681-text);
  font-family: var(--e1681-font);
  font-size: var(--e1681-font-size);
  background: var(--e1681-bg) padding-box;
  border-style: solid; border-color: var(--e1681-border); border-width: var(--e1681-tip-frame-width);
  border-image: var(--e1681-tip-frame) var(--e1681-tip-frame-slice) / var(--e1681-tip-frame-width) stretch;
  box-sizing: border-box;
}

/* windows: placed by useFitToViewport in whole pixels; header kept, body scrolls */
.e1681-panel {
  position: fixed;
  z-index: 10;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  pointer-events: auto;
}
.e1681-panel-header { display: flex; align-items: center; gap: 8px; flex: none; padding: 2px 4px 6px; }
.e1681-panel-title { flex: 1; min-width: 0; margin: 0; font-size: 1.25em; font-weight: normal; color: var(--e1681-accent); }
.e1681-panel-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 0 4px 4px; }
.e1681-panel-footer { flex: none; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; padding: 6px 4px 0; }
.e1681-close {
  flex: none; padding: 2px; border: 0; background: none; color: var(--e1681-text); cursor: pointer; line-height: 0;
}
.e1681-close:hover { color: var(--e1681-accent); }
/* a touch screen's sheet: the whole screen inside the safe area */
.e1681-panel.e1681-sheet {
  inset: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
  width: auto;
  height: auto;
}
.e1681-panel.e1681-sheet .e1681-panel-body { overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }

/* controls */
.e1681-button, .e1681-input, .e1681-select {
  color: var(--e1681-text);
  font: inherit;
  background: var(--e1681-control-bg) padding-box;
  border-style: solid; border-color: var(--e1681-border); border-width: var(--e1681-control-frame-width);
  border-image: var(--e1681-control-frame) var(--e1681-control-frame-slice) / var(--e1681-control-frame-width) stretch;
  box-shadow: none;
}
.e1681-button { padding: 2px 10px; cursor: pointer; min-height: 28px; }
.e1681-button.small { padding: 0 6px; min-height: 22px; }
.e1681-button.ghost { background-color: transparent; }
.e1681-button.e1681-armed { color: var(--e1681-accent); }
.e1681-button:hover:not(:disabled) { color: var(--e1681-accent); }
/* pressed: the same face a pixel lower, never a transform */
.e1681-button:active:not(:disabled) { padding-top: 3px; padding-bottom: 1px; }
.e1681-button:disabled { opacity: 0.55; cursor: default; }
.e1681-input { padding: 2px 6px; min-width: 0; }
.e1681-glyph { display: inline-block; flex: none; vertical-align: -1px; }

/* tabs: a row that scrolls sideways, or wraps with .wrap */
.e1681-tabs { display: flex; gap: 2px; align-items: flex-end; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; margin-bottom: 8px; }
.e1681-tabs::-webkit-scrollbar { display: none; }
.e1681-tabs.wrap { flex-wrap: wrap; overflow-x: visible; row-gap: 4px; }
.e1681-tab {
  flex: 0 0 auto;
  padding: 2px 10px;
  color: var(--e1681-muted);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
  background: var(--e1681-control-bg) padding-box;
  border-style: solid; border-color: var(--e1681-border); border-width: var(--e1681-tab-frame-width);
  border-image: var(--e1681-tab-frame) var(--e1681-tab-frame-slice) / var(--e1681-tab-frame-width) stretch;
}
.e1681-tab:hover:not(.active):not(:disabled) { color: var(--e1681-text); }
.e1681-tab.active { color: var(--e1681-accent); padding-bottom: 6px; border-image-source: var(--e1681-tab-active-frame); }
.e1681-tab:disabled { opacity: 0.55; cursor: default; }
.e1681-tab:focus-visible { outline: 2px solid var(--e1681-accent); outline-offset: -4px; }
.e1681-tabs.small { margin-bottom: 4px; }
.e1681-tabs.small .e1681-tab { padding: 0 6px; }
.e1681-tabs.small .e1681-tab.active { padding-bottom: 4px; }

/* list beside detail */
.e1681-split {
  display: grid;
  grid-template-columns: var(--e1681-split-list, minmax(0, 1fr)) minmax(0, 1fr);
  gap: 12px;
  height: min(58vh, 620px);
}
.e1681-split.fit { height: auto; max-height: min(58vh, 620px); }
.e1681-split-list, .e1681-split-detail { min-height: 0; overflow-y: auto; overflow-x: hidden; }
.e1681-split-list { padding-right: 4px; }
.e1681-split-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: var(--e1681-well) padding-box;
  border-style: solid; border-color: var(--e1681-border); border-width: var(--e1681-well-frame-width);
  border-image: var(--e1681-well-frame) var(--e1681-well-frame-slice) / var(--e1681-well-frame-width) stretch;
}
.e1681-split-empty { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; color: var(--e1681-muted); }
.e1681-split.stack { grid-template-columns: minmax(0, 1fr); }
.e1681-split.stack.show-list .e1681-split-detail, .e1681-split.stack.show-detail .e1681-split-list { display: none; }
.e1681-split-back { align-self: flex-start; }
.e1681-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; margin-bottom: 4px; border: var(--e1681-border-width) solid transparent; }
.e1681-pickable { cursor: pointer; }
.e1681-pickable:hover:not(.picked):not(.disabled) { border-color: var(--e1681-border); }
.e1681-row.picked { border-color: var(--e1681-accent); color: var(--e1681-accent); }
.e1681-row.disabled { opacity: 0.55; cursor: default; }

/* the select: as wide as its longest label */
.e1681-select { display: inline-flex; align-items: center; gap: 6px; flex: none; padding: 1px 4px; text-align: left; cursor: pointer; }
.e1681-select:hover:not(:disabled), .e1681-select.open { color: var(--e1681-accent); }
.e1681-select:disabled { opacity: 0.6; cursor: default; }
.e1681-select.grow { flex: 1 1 auto; min-width: 0; }
.e1681-select.grow .e1681-select-labels { flex: 1 1 auto; min-width: 0; overflow: hidden; }
.e1681-select.grow .e1681-select-labels > span { overflow: hidden; text-overflow: ellipsis; }
.e1681-select-labels { display: grid; white-space: nowrap; }
.e1681-select-labels > span { grid-area: 1 / 1; visibility: hidden; }
.e1681-select-labels > span.shown { visibility: visible; }
.e1681-select-list {
  position: fixed;
  z-index: 10000;
  box-sizing: border-box;
  width: max-content;
  padding: 2px;
  overflow-y: auto;
  pointer-events: auto;
}
.e1681-select-option { padding: 2px 6px; white-space: nowrap; cursor: pointer; }
.e1681-select-list.measuring .e1681-select-option { width: max-content; }
.e1681-select-option.hot { background: var(--e1681-control-bg); }
.e1681-select-option.picked { color: var(--e1681-accent); }

/* tooltips */
.e1681-tooltip { position: fixed; z-index: 10001; max-width: 360px; padding: 4px 8px; overflow: hidden; pointer-events: none; }
.e1681-title-tip { white-space: pre-line; }

/* slider: a square knob, flat fills */
.e1681-slider-row { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.e1681-slider { flex: 1; min-width: 0; padding: 6px 7px; cursor: pointer; touch-action: none; user-select: none; pointer-events: auto; }
.e1681-slider:focus { outline: none; }
.e1681-slider:focus-visible { outline: 2px solid var(--e1681-accent); outline-offset: 2px; }
.e1681-slider[aria-disabled='true'] { opacity: 0.55; cursor: default; }
.e1681-slider-track {
  position: relative;
  height: 6px;
  background: var(--e1681-well) padding-box;
  border-style: solid; border-color: var(--e1681-border); border-width: var(--e1681-well-frame-width);
  border-image: var(--e1681-well-frame) var(--e1681-well-frame-slice) / var(--e1681-well-frame-width) stretch;
}
.e1681-slider-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--e1681-accent); }
/* the knob is offset by half its own whole-pixel width with a margin, so it stays on the pixel grid */
.e1681-slider-knob { position: absolute; top: -6px; width: 10px; height: 14px; margin-left: -5px; background: var(--e1681-text); border: 2px solid var(--e1681-well); box-sizing: border-box; }
.e1681-slider-value { min-width: 40px; text-align: right; font-variant-numeric: tabular-nums; }

/* dialogs */
.e1681-backdrop { position: fixed; inset: 0; z-index: 9000; background: var(--e1681-backdrop); pointer-events: auto; }
.e1681-dialog { position: fixed; display: flex; flex-direction: column; overflow: hidden; padding: 8px 10px; }
.e1681-dialog-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.e1681-dialog-actions { flex: none; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; padding-top: 10px; }
.e1681-confirm-text { white-space: pre-line; }
.e1681-confirm-qty { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
.e1681-confirm-qty-input { width: 56px; text-align: right; }
.e1681-choice-list { margin-top: 8px; }
.e1681-choice-icon { flex: none; line-height: 0; }
.e1681-choice-label { flex: 1; min-width: 0; }
.e1681-choice-note { flex: none; margin-left: auto; color: var(--e1681-muted); }

/* sprites at whole multiples */
.e1681-pixel-image { display: inline-flex; align-items: center; justify-content: center; flex: none; overflow: hidden; }
.e1681-pixel-image > img { image-rendering: pixelated; flex: none; }
`;

const STYLE_ID = 'e1681-react-base';

/**
 * Puts `baseCss` into the page once, first in `<head>` so the game's own rules (and its custom properties) win
 * without needing more specific selectors. Returns the `<style>` element; nothing on a server.
 */
export function injectBaseCss(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): HTMLStyleElement | null {
  if (!doc) return null;
  const found = doc.getElementById(STYLE_ID);
  if (found) return found as HTMLStyleElement;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = baseCss;
  doc.head.insertBefore(style, doc.head.firstChild);
  return style;
}
