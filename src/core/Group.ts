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

  /**
   * Puts `child` directly below `other` in the draw order. Already there, it does nothing: taking a child out and
   * putting it back marks the render group's structure changed, and Pixi rebuilds its draw instructions for that
   * frame — a held weapon ordered against its body every frame did it every frame.
   */
  moveBelow(child: PixiContainer, other: PixiContainer): this {
    if (child.parent !== this || other.parent !== this || child === other) return this;
    if (this.getChildIndex(child) === this.getChildIndex(other) - 1) return this;
    this.removeChild(child);
    this.addChildAt(child, this.getChildIndex(other));
    return this;
  }

  /**
   * Keeps `child` drawn above `other`, anywhere above it: moved (directly above) only when it is below. What a weapon
   * held over its body asks for. `moveAbove` from two pieces each wanting to sit *directly* above the same body (two
   * blades, a fist on a hilt, a load) pushed the other out every frame, and every push rebuilt Pixi's instructions.
   */
  keepAbove(child: PixiContainer, other: PixiContainer): this {
    if (child.parent !== this || other.parent !== this || child === other) return this;
    if (this.getChildIndex(child) > this.getChildIndex(other)) return this;
    return this.moveAbove(child, other);
  }

  /** Keeps `child` drawn below `other`, anywhere below it: moved (directly below) only when it is above (`keepAbove`). */
  keepBelow(child: PixiContainer, other: PixiContainer): this {
    if (child.parent !== this || other.parent !== this || child === other) return this;
    if (this.getChildIndex(child) < this.getChildIndex(other)) return this;
    return this.moveBelow(child, other);
  }

  /** Puts `child` directly above `other` in the draw order; already there, it does nothing (see `moveBelow`). */
  moveAbove(child: PixiContainer, other: PixiContainer): this {
    if (child.parent !== this || other.parent !== this || child === other) return this;
    if (this.getChildIndex(child) === this.getChildIndex(other) + 1) return this;
    this.removeChild(child);
    this.addChildAt(child, this.getChildIndex(other) + 1);
    return this;
  }
}
