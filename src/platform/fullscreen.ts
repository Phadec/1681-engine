/**
 * Fullscreen through the standard API, with the `webkit` names older Safari (and iPadOS before 16.4) still use. Where
 * neither exists (iPhone Safari never offers an element fullscreen) every call is a safe no-op: `enterFullscreen`
 * resolves false and `isFullscreen` stays false, so a game can show its button only when `fullscreenSupported()`.
 */

/** The slice of `Document` the helpers read; tests pass their own. */
export interface FullscreenDocument {
  readonly fullscreenElement?: Element | null;
  readonly webkitFullscreenElement?: Element | null;
  readonly fullscreenEnabled?: boolean;
  readonly webkitFullscreenEnabled?: boolean;
  readonly documentElement?: Element;
  exitFullscreen?(): Promise<void>;
  webkitExitFullscreen?(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

interface FullscreenElement {
  requestFullscreen?(options?: FullscreenOptions): Promise<void>;
  webkitRequestFullscreen?(): void;
}

function currentDocument(): FullscreenDocument | null {
  return typeof document === 'undefined' ? null : (document as unknown as FullscreenDocument);
}

/** True when this page may put an element in fullscreen at all. */
export function fullscreenSupported(doc: FullscreenDocument | null = currentDocument()): boolean {
  return doc !== null && (doc.fullscreenEnabled === true || doc.webkitFullscreenEnabled === true);
}

/** True while something is in fullscreen. */
export function isFullscreen(doc: FullscreenDocument | null = currentDocument()): boolean {
  if (!doc) return false;
  return (doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null) !== null;
}

/**
 * Puts `element` (default the whole page) in fullscreen; resolves true once it is. Browsers allow it only inside a
 * user gesture, so call it from a click or key handler. A refusal resolves false instead of throwing: a game's
 * fullscreen button should never take the frame down with it.
 */
export async function enterFullscreen(element?: Element, doc: FullscreenDocument | null = currentDocument()): Promise<boolean> {
  if (!doc) return false;
  const target = (element ?? doc.documentElement) as (Element & FullscreenElement) | undefined;
  if (!target) return false;
  try {
    if (typeof target.requestFullscreen === 'function') await target.requestFullscreen({ navigationUI: 'hide' });
    else if (typeof target.webkitRequestFullscreen === 'function') target.webkitRequestFullscreen();
    else return false;
  } catch {
    return false;
  }
  return isFullscreen(doc) || typeof target.requestFullscreen !== 'function';
}

/** Leaves fullscreen; resolves false when nothing was in it or the browser refused. */
export async function exitFullscreen(doc: FullscreenDocument | null = currentDocument()): Promise<boolean> {
  if (!doc || !isFullscreen(doc)) return false;
  try {
    if (typeof doc.exitFullscreen === 'function') await doc.exitFullscreen();
    else if (typeof doc.webkitExitFullscreen === 'function') doc.webkitExitFullscreen();
    else return false;
  } catch {
    return false;
  }
  return true;
}

/** Enters or leaves; resolves whether the page is in fullscreen afterwards (as far as the call could tell). */
export async function toggleFullscreen(element?: Element, doc: FullscreenDocument | null = currentDocument()): Promise<boolean> {
  if (isFullscreen(doc)) return !(await exitFullscreen(doc));
  return enterFullscreen(element, doc);
}

/**
 * Calls `fn(isFullscreen)` whenever the page enters or leaves fullscreen — by the game or by the player pressing Esc,
 * which no game code sees otherwise. Returns the unsubscribe.
 */
export function onFullscreenChange(fn: (fullscreen: boolean) => void, doc: FullscreenDocument | null = currentDocument()): () => void {
  if (!doc) return () => {};
  const handler = () => fn(isFullscreen(doc));
  doc.addEventListener('fullscreenchange', handler);
  doc.addEventListener('webkitfullscreenchange', handler);
  return () => {
    doc.removeEventListener('fullscreenchange', handler);
    doc.removeEventListener('webkitfullscreenchange', handler);
  };
}
