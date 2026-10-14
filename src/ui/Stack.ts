import type { Container } from 'pixi.js';
import { stackLayout, type StackOptions } from './layout/stack';
import { sizeOf, Widget } from './Widget';

/**
 * Lays its children one after another, down or across, with a gap and padding, and takes the size they need. Call
 * `layout()` after changing a child's size; adding or removing through the stack lays out for you.
 */
export class Stack extends Widget {
  constructor(private readonly options: StackOptions = {}) {
    super();
  }

  add(...children: Container[]): this {
    for (const c of children) this.addChild(c);
    this.layout();
    this.host?.invalidateFocus();
    return this;
  }

  remove(child: Container, destroy = false): this {
    if (child.parent === this) this.removeChild(child);
    if (destroy) child.destroy({ children: true });
    this.layout();
    this.host?.invalidateFocus();
    return this;
  }

  layout(): this {
    const kids = this.children.filter((c) => c.visible);
    const snap = this.options.snap ?? this.host?.pixelPerfect ?? false;
    const result = stackLayout(kids.map(sizeOf), { ...this.options, snap });
    kids.forEach((c, i) => {
      const r = result.items[i]!;
      c.position.set(r.x, r.y);
      // stretched children take the cross size
      if (this.options.align === 'stretch' && c instanceof Widget && (c.boxWidth !== r.width || c.boxHeight !== r.height)) c.resize(r.width, r.height);
    });
    this.boxW = result.width;
    this.boxH = result.height;
    return this;
  }

  protected redraw(): void {}
}
