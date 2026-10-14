import type { ReactNode } from 'react';
import { createStore } from '../ui/dom/createStore';

export interface ConfirmQuestion {
  text: ReactNode;
  /** The confirm button's word; default the provider's `ok`. */
  ok?: string;
  cancel?: string;
  /** Above 1 the dialog also asks how many (1..max), starting at all of them; a plain question has 0. */
  max: number;
  /** The amount chosen, or 0 when cancelled. */
  resolve: (qty: number) => void;
}

/** The open question, read by `ConfirmDialog`. */
export const confirmStore = createStore<{ pending: ConfirmQuestion | null }>({ pending: null });

export interface AskOptions {
  ok?: string;
  cancel?: string;
}

function ask(text: ReactNode, max: number, options: AskOptions): Promise<number> {
  // a new question cancels the one still open
  confirmStore.getState().pending?.resolve(0);
  return new Promise((resolve) => confirmStore.setState({ pending: { text, max, resolve, ...options } }));
}

/** A yes/no question in the kit's own dialog instead of `window.confirm`; resolves true when confirmed. */
export function askConfirm(text: ReactNode, options: AskOptions = {}): Promise<boolean> {
  return ask(text, 0, options).then((qty) => qty > 0);
}

/** The same question with a slider and a field for how many of `max`; resolves 0 when cancelled. */
export function askQuantity(text: ReactNode, max: number, options: AskOptions = {}): Promise<number> {
  return ask(text, Math.max(1, Math.floor(max)), options);
}

/** Answers the open question (`qty` 0 cancels). */
export function answerConfirm(qty: number): void {
  const pending = confirmStore.getState().pending;
  confirmStore.setState({ pending: null });
  pending?.resolve(qty);
}

/** Cancels the open question, if any (a phone's back button). Returns whether there was one. */
export function cancelConfirm(): boolean {
  if (!confirmStore.getState().pending) return false;
  answerConfirm(0);
  return true;
}

/** A typed quantity held to 1..max: digits only, anything else 1. */
export function parseQuantity(text: string, max: number): number {
  return Math.max(1, Math.min(max, Math.floor(Number(text.replace(/[^0-9]/g, '')) || 1)));
}
