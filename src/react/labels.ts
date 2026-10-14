/**
 * Every word the kit itself prints, in English. A game hands its own (translated) words to `UiProvider`'s `labels`, or
 * to a component's own prop; the engine never translates anything.
 */
export interface UiLabels {
  /** The close button's spoken name; `{0}` is the window's title. */
  close: string;
  /** The close button's tooltip. */
  closeHint: string;
  /** The button that takes a stacked `SplitPane` back from the detail to the list. */
  backToList: string;
  /** What an empty detail pane says. */
  pickHint: string;
  cancel: string;
  ok: string;
  /** The quantity slider's and field's spoken name. */
  quantity: string;
  /** The choice dialog's confirm button. */
  choose: string;
  /** What an armed `ConfirmButton` says when the game gives it no words of its own. */
  confirmAgain: string;
}

export const DEFAULT_LABELS: UiLabels = {
  close: 'Close {0}',
  closeHint: 'Close (Esc)',
  backToList: '‹ List',
  pickHint: 'Pick an entry on the left.',
  cancel: 'Cancel',
  ok: 'OK',
  quantity: 'Quantity',
  choose: 'Choose',
  confirmAgain: 'Sure?',
};

/** `{0}`, `{1}`… replaced by the arguments, in order. */
export function fillLabel(label: string, ...args: readonly string[]): string {
  return label.replace(/\{(\d+)\}/g, (all, i: string) => args[Number(i)] ?? all);
}
