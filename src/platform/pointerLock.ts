/**
 * Pointer lock for mouse-look and twin-stick aiming with the mouse: the cursor hides and movement comes as
 * `movementX`/`movementY` deltas. Browsers grant it only inside a user gesture and the player can always leave it with
 * Esc, so a game listens with `onPointerLockChange` rather than assuming it holds.
 */

/** The slice of `Document` used here; tests pass their own. */
export interface PointerLockDocument {
  readonly pointerLockElement?: Element | null;
  exitPointerLock?(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

interface LockableElement {
  requestPointerLock?(options?: { unadjustedMovement?: boolean }): Promise<void> | void;
}

function currentDocument(): PointerLockDocument | null {
  return typeof document === 'undefined' ? null : (document as unknown as PointerLockDocument);
}

/** True while `element` (or, with none named, anything) holds the pointer. */
export function isPointerLocked(element?: Element, doc: PointerLockDocument | null = currentDocument()): boolean {
  const held = doc?.pointerLockElement ?? null;
  return element === undefined ? held !== null : held === element;
}

/**
 * Asks to lock the pointer to `element` (the game canvas); resolves whether it holds afterwards. `raw` asks for
 * unaccelerated movement where the browser offers it, and falls back to the plain lock where it refuses that option.
 */
export async function requestPointerLock(element: Element, options: { raw?: boolean } = {}, doc: PointerLockDocument | null = currentDocument()): Promise<boolean> {
  const target = element as Element & LockableElement;
  if (!doc || typeof target.requestPointerLock !== 'function') return false;
  try {
    await target.requestPointerLock(options.raw ? { unadjustedMovement: true } : undefined);
  } catch {
    if (!options.raw) return false;
    try {
      await target.requestPointerLock();
    } catch {
      return false;
    }
  }
  return isPointerLocked(element, doc);
}

/** Releases the pointer; a no-op when nothing holds it. */
export function exitPointerLock(doc: PointerLockDocument | null = currentDocument()): void {
  if (doc?.pointerLockElement) doc.exitPointerLock?.();
}

/** Calls `fn(locked)` whenever the lock is taken or lost (Esc included). Returns the unsubscribe. */
export function onPointerLockChange(fn: (locked: boolean) => void, doc: PointerLockDocument | null = currentDocument()): () => void {
  if (!doc) return () => {};
  const handler = () => fn(isPointerLocked(undefined, doc));
  doc.addEventListener('pointerlockchange', handler);
  return () => doc.removeEventListener('pointerlockchange', handler);
}
