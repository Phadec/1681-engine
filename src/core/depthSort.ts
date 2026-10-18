import { Container } from 'pixi.js';

/*
 * Depth sorting that does not rebuild Pixi's draw instructions unless the order really changed. Pixi marks a render
 * group's structure changed whenever a child's `zIndex` moves, so a world sorted by depth — every body's depth its
 * feet's y — rebuilt every instruction of every child every frame anything walked up or down the screen, though the
 * order it draws in changes only when one body passes another. For a container handed to `deferDepthSort` a changed
 * `zIndex` only notes the container; `flushDepthSorts`, once a frame before drawing, looks along its children once and
 * sorts them, marking the structure changed, only when they are out of order.
 */

interface Sortable {
  sortDirty: boolean;
  sortableChildren: boolean;
  renderGroup?: { structureDidChange: boolean } | null;
  parentRenderGroup?: { structureDidChange: boolean } | null;
  sortChildren(): void;
}

const deferred = new WeakSet<Container>();
const pending = new Set<Container>();
let patched = false;

function patch(): void {
  if (patched) return;
  patched = true;
  const proto = Container.prototype as unknown as { depthOfChildModified(this: Container): void };
  const original = proto.depthOfChildModified;
  proto.depthOfChildModified = function depthOfChildModified(this: Container): void {
    const parent = this.parent;
    if (parent && deferred.has(parent)) {
      const p = parent as unknown as Sortable;
      p.sortableChildren = true;
      p.sortDirty = true;
      pending.add(parent);
      return;
    }
    original.call(this);
  };
}

/** Checks `container`'s depth order once a frame (`flushDepthSorts`) instead of at every child's `zIndex` change. */
export function deferDepthSort(container: Container): void {
  patch();
  deferred.add(container);
}

/** Sorts each container whose children changed depth, marking its render group changed only if the order did. */
export function flushDepthSorts(): void {
  for (const c of pending) {
    if (c.destroyed) continue;
    const s = c as unknown as Sortable;
    const kids = c.children;
    let ordered = true;
    for (let i = 1; i < kids.length; i++) {
      if (kids[i - 1]!.zIndex > kids[i]!.zIndex) {
        ordered = false;
        break;
      }
    }
    if (ordered) {
      s.sortDirty = false;
      continue;
    }
    s.sortChildren();
    const group = s.renderGroup ?? s.parentRenderGroup;
    if (group) group.structureDidChange = true;
  }
  pending.clear();
}
