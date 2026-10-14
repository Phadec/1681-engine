/**
 * Pauses a loop while the page is hidden and resumes it when it comes back — but only if it was the one that paused
 * it: a game paused by its own menu stays paused when the tab returns. Pure (the page's visibility comes in through
 * `hidden`/`shown`), so the rule is tested under node; `watchVisibility` wires it to the document.
 */
export interface Pausable {
  readonly paused: boolean;
  pause(): void;
  resume(): void;
}

export class HiddenPause {
  private pausedByUs = false;

  constructor(private readonly target: Pausable) {}

  hidden(): void {
    if (this.target.paused) return;
    this.target.pause();
    this.pausedByUs = true;
  }

  shown(): void {
    if (!this.pausedByUs) return;
    this.pausedByUs = false;
    // someone resumed it by hand while hidden: nothing left to do
    if (this.target.paused) this.target.resume();
  }

  /** The game paused or resumed it itself: whatever happens next is its choice, not ours to undo. */
  forget(): void {
    this.pausedByUs = false;
  }

  /** Listens to `visibilitychange` on `doc`; returns the unsubscribe. A no-op without a document. */
  watch(doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> | null = typeof document === 'undefined' ? null : document): () => void {
    if (!doc) return () => {};
    const onChange = () => (doc.visibilityState === 'hidden' ? this.hidden() : this.shown());
    doc.addEventListener('visibilitychange', onChange);
    if (doc.visibilityState === 'hidden') this.hidden();
    return () => doc.removeEventListener('visibilitychange', onChange);
  }
}
