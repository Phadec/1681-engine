import { type CSSProperties, type MouseEvent, type ReactNode, useRef, useState } from 'react';
import { splitModeFor, SPLIT_STACK_BELOW } from './placement';
import { useFillSheet } from './useFillSheet';
import { useUi, useCx } from './UiProvider';
import { useViewport } from './useViewport';

export interface SplitPaneProps {
  list: ReactNode;
  /** The right pane; `null`/`undefined`/`false` shows `empty` instead. */
  detail?: ReactNode;
  empty?: ReactNode;
  /** The list column's width (any CSS grid track); by default the two share the width evenly. */
  listWidth?: string;
  /** Height follows the content (capped) instead of the fixed window height: for panes with little in them. */
  fit?: boolean;
  /** Below this width a touch screen shows one pane at a time (default `SPLIT_STACK_BELOW`, 600). */
  stackBelow?: number;
  /** A click on an element matching this opens the detail when stacked (default `.e1681-pickable`). */
  pickSelector?: string;
  /** The back button's word (default: the provider's `backToList`). */
  backLabel?: ReactNode;
  className?: string;
}

/**
 * Two panes side by side: a list that scrolls on its own and the detail of what is picked, which stays in view
 * however long the list grows, so a window is as tall as `.e1681-split` says and never taller. On a touch screen
 * narrower than `stackBelow` only one pane shows at a time: tapping a pickable row (`.e1681-pickable`) opens its
 * detail, and the back button returns. In a touch sheet it fills the height left below what sits above it.
 */
export function SplitPane({ list, detail, empty, listWidth, fit, stackBelow = SPLIT_STACK_BELOW, pickSelector = '.e1681-pickable', backLabel, className }: SplitPaneProps) {
  const cx = useCx();
  const ui = useUi();
  const width = useViewport(ui.touch).width;
  const stack = splitModeFor(width, ui.touch, stackBelow) === 'stack';
  const [showDetail, setShowDetail] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useFillSheet(box, ui.touch, !!fit);
  const style = listWidth && !stack ? ({ '--e1681-split-list': listWidth } as CSSProperties) : undefined;
  const picked = (e: MouseEvent) => {
    if (stack && (e.target as HTMLElement).closest(pickSelector)) setShowDetail(true);
  };
  const mode = stack ? (showDetail ? ' stack show-detail' : ' stack show-list') : '';
  return (
    <div ref={box} className={cx(`e1681-split${fit ? ' fit' : ''}${mode}${className ? ` ${className}` : ''}`)} style={style}>
      <div className={cx('e1681-split-list')} onClickCapture={picked}>
        {list}
      </div>
      <div className={cx('e1681-split-detail')}>
        {stack && (
          <button type="button" className={cx('e1681-button small e1681-split-back')} onClick={() => setShowDetail(false)}>
            {backLabel ?? ui.labels.backToList}
          </button>
        )}
        {detail || <div className={cx('e1681-split-empty')}>{empty ?? ui.labels.pickHint}</div>}
      </div>
    </div>
  );
}
