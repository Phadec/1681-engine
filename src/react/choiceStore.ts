import type { ReactNode } from 'react';
import { createStore } from '../ui/dom/createStore';

/** One row of a choice: a line of text, with an icon before it and a note after it if the game gives them. */
export interface ChoiceOption {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  note?: ReactNode;
  disabled?: boolean;
}

export interface ChoiceQuestion {
  text: ReactNode;
  options: readonly ChoiceOption[];
  /** The confirm button's word; default the provider's `choose`. */
  confirm?: string;
  cancel?: string;
  /** The id picked, or null when cancelled. */
  resolve: (id: string | null) => void;
}

/** The open choice, read by `ChoiceDialog`. */
export const choiceStore = createStore<{ pending: ChoiceQuestion | null }>({ pending: null });

/** Asks the player to pick one of `options`; resolves its id, or null when cancelled. */
export function askChoice(text: ReactNode, options: readonly ChoiceOption[], words: { confirm?: string; cancel?: string } = {}): Promise<string | null> {
  choiceStore.getState().pending?.resolve(null);
  return new Promise((resolve) => choiceStore.setState({ pending: { text, options, resolve, ...words } }));
}

/** Answers the open choice (`null` cancels). */
export function answerChoice(id: string | null): void {
  const pending = choiceStore.getState().pending;
  choiceStore.setState({ pending: null });
  pending?.resolve(id);
}

/** Cancels the open choice, if any (a phone's back button). Returns whether there was one. */
export function cancelChoice(): boolean {
  if (!choiceStore.getState().pending) return false;
  answerChoice(null);
  return true;
}

/** The option picked first: the first one that can be taken. */
export function firstChoice(options: readonly ChoiceOption[]): string | null {
  return options.find((o) => !o.disabled)?.id ?? null;
}
