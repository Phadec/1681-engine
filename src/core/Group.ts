import { Container, type Container as PixiContainer } from 'pixi.js';
import { GameObject } from './gameObject';

/** A container of world objects, drawn in list order (children do not sort by depth). */
export class Group extends GameObject(Container) {
  get list(): PixiContainer[] {
    return this.children;
  }

  add(child: PixiContainer | PixiContainer[]): this {
    for (const c of Array.isArray(child) ? child : [child]) this.addChild(c);
    return this;
  }

  addAt(child: PixiContainer, index: number): this {
    this.addChildAt(child, Math.min(index, this.children.length));
    return this;
  }

  remove(child: PixiContainer, destroy = false): this {
    if (child.parent === this) this.removeChild(child);
    if (destroy) child.destroy({ children: true, context: true });
    return this;
  }

  /** Puts `child` directly below `other` in the draw order. */
  moveBelow(child: PixiContainer, other: PixiContainer): this {
    if (child.parent !== this || other.parent !== this || child === other) return this;
    this.removeChild(child);
    this.addChildAt(child, this.getChildIndex(other));
    return this;
  }

  /** Puts `child` directly above `other` in the draw order. */
  moveAbove(child: PixiContainer, other: PixiContainer): this {
    if (child.parent !== this || other.parent !== this || child === other) return this;
    this.removeChild(child);
    this.addChildAt(child, this.getChildIndex(other) + 1);
    return this;
  }
}
