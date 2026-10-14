/** What `onAppResume` listens on: `document` and `window` in a browser; a test passes its own. */
export interface ResumeEnv {
  document?: { readonly visibilityState?: string; addEventListener(type: string, cb: () => void): void; removeEventListener(type: string, cb: () => void): void };
  window?: { addEventListener(type: string, cb: (e: { persisted?: boolean }) => void): void; removeEventListener(type: string, cb: (e: { persisted?: boolean }) => void): void };
  now?: () => number;
}

/**
 * Calls `cb` when the app comes back to the foreground: the tab shown again (`visibilitychange`) or the page restored
 * from the back/forward cache (`pageshow` with `persisted`). A phone freezes a background tab — timers stop, a socket
 * may be dead without having closed — so this is the moment to check what survived. `cb` gets how long the app was
 * hidden, ms (0 when the hiding was not seen). Returns the unsubscribe; does nothing where there is no document.
 */
export function onAppResume(cb: (hiddenMs: number) => void, env: ResumeEnv = globalThis as ResumeEnv): () => void {
  const doc = env.document;
  const win = env.window;
  const now = env.now ?? (() => Date.now());
  let hiddenAt: number | null = null;
  const resumed = (): void => {
    const hiddenMs = hiddenAt === null ? 0 : Math.max(0, now() - hiddenAt);
    hiddenAt = null;
    cb(hiddenMs);
  };
  const onVisibility = (): void => {
    if (doc?.visibilityState === 'hidden') hiddenAt = now();
    else if (hiddenAt !== null) resumed();
  };
  // a page restored from the back/forward cache never fired `visibilitychange` on its way back
  const onPageShow = (e: { persisted?: boolean }): void => {
    if (e.persisted) resumed();
  };
  doc?.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('pageshow', onPageShow);
  return () => {
    doc?.removeEventListener('visibilitychange', onVisibility);
    win?.removeEventListener('pageshow', onPageShow);
  };
}
