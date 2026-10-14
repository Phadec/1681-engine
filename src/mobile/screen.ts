/** Px kept clear at each edge: the notch, the rounded corners, the home bar. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The safe-area insets as the browser has them now (CSS `env(safe-area-inset-*)`), read through a hidden probe
 * element: what a canvas HUD must keep its buttons out of when the web view is drawn edge to edge. Zeros where
 * there is no document or no notch.
 */
export function safeAreaInsets(doc: Document | undefined = globalThis.document): Insets {
  if (!doc?.body) return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = doc.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px)';
  doc.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const px = (v: string) => parseFloat(v) || 0;
  const out = { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
  probe.remove();
  return out;
}

/** The slice of the Screen Wake Lock API used, so a test can hand in its own. */
export interface WakeLockLike {
  request(type: 'screen'): Promise<{ release(): Promise<void>; addEventListener?(type: 'release', cb: () => void): void }>;
}

/**
 * Keeps the screen on while the game runs (a phone dims and locks during a cut scene or a long think otherwise),
 * through the Screen Wake Lock API. The browser drops the lock whenever the page is hidden, so it is asked for again
 * each time the page comes back. Resolves to the release; does nothing where the API is missing or refuses.
 */
export async function keepScreenOn(
  wakeLock: WakeLockLike | undefined = (globalThis.navigator as Navigator & { wakeLock?: WakeLockLike } | undefined)?.wakeLock,
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> | undefined = globalThis.document,
): Promise<() => void> {
  if (!wakeLock) return () => undefined;
  let lock: Awaited<ReturnType<WakeLockLike['request']>> | null = null;
  let stopped = false;
  const take = async () => {
    try {
      const l = await wakeLock.request('screen');
      if (stopped) return void l.release();
      lock = l;
      l.addEventListener?.('release', () => {
        if (lock === l) lock = null;
      });
    } catch {
      // refused (battery saver, no gesture yet): the screen just dims as usual
    }
  };
  const onVisible = () => {
    if (doc?.visibilityState === 'visible' && !lock) void take();
  };
  await take();
  doc?.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    doc?.removeEventListener('visibilitychange', onVisible);
    void lock?.release();
    lock = null;
  };
}
