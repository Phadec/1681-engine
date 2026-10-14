import type { Container } from 'pixi.js';
import { stackLayout } from './layout/stack';
import { ScrollView, type ScrollViewOptions } from './ScrollView';
import { sizeOf, Widget } from './Widget';

export interface ListOptions extends ScrollViewOptions {
  /** Between rows (default 0). */
  gap?: number;
  /** Inside the list's edge (default 0). */
  padding?: number;
  /** Rows as wide as the list, less the padding (default true). */
  stretch?: boolean;
}

/** A vertical list of rows in a scroll view: rows stacked with a gap, clipped, scrolled, followed by the focus. */
export class List extends ScrollView {
  private readonly rows: Container[] = [];

  constructor(private readonly listOptions: ListOptions) {
    super(listOptions);
  }

  get items(): readonly Container[] {
    return this.rows;
  }

  add(...rows: Container[]): this {
    for (const r of rows) {
      this.rows.push(r);
      this.content.addChild(r);
    }
    return this.relayout();
  }

  remove(row: Container, destroy = false): this {
    const i = this.rows.indexOf(row);
    if (i >= 0) this.rows.splice(i, 1);
    if (row.parent === this.content) this.content.removeChild(row);
    if (destroy) row.destroy({ children: true });
    return this.relayout();
  }

  clear(destroy = true): this {
    for (const r of this.rows.splice(0)) {
      this.content.removeChild(r);
      if (destroy) r.destroy({ children: true });
    }
    return this.relayout();
  }

  /** Lays the rows out again (after a row changed size). */
  relayout(): this {
    const pad = this.listOptions.padding ?? 0;
    const stretch = this.listOptions.stretch ?? true;
    const snap = this.host?.pixelPerfect ?? false;
    const result = stackLayout(this.rows.map(sizeOf), {
      gap: this.listOptions.gap ?? 0,
      padding: pad,
      align: stretch ? 'stretch' : 'start',
      crossSize: this.boxWidth - 2 * pad,
      snap,
    });
    this.rows.forEach((r, i) => {
      const rect = result.items[i]!;
      r.position.set(rect.x, rect.y);
      if (stretch && r instanceof Widget && r.boxWidth !== rect.width) r.resize(rect.width, r.boxHeight);
    });
    this.setContentHeight(result.height);
    this.host?.invalidateFocus();
    return this;
  }
}
