import { type CSSProperties, type ReactNode, useRef } from 'react';
import type { Point } from '../ui/layout/geometry';
import { Glyph } from './Glyph';
import { fillLabel } from './labels';
import { sheetScaleStyle } from './placement';
import { SCROLL_CLASS, useFitToViewport } from './useFitToViewport';
import { useUi, useCx } from './UiProvider';

export interface PanelProps {
  title: ReactNode;
  /** The close button's action; no close button without it. */
  onClose?: () => void;
  children?: ReactNode;
  /** The width it wants, in px (its own units); default: as wide as its content. */
  width?: number;
  /** Where it wants to stand, screen px; default: centred. It is moved back inside the screen either way. */
  at?: Point;
  /** Under the scrolling body, never scrolled away (a row of buttons). */
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** The title as plain text, for the close button's spoken name when `title` is not a string. */
  titleText?: string;
}

/**
 * A window that never overflows the screen: fitted by `fitToViewport` (moved inside the edges, cut to what is left,
 * shrunk to `minScale` when the `UiProvider` allows it) with its header kept and its body scrolling under it. Placed
 * in whole pixels by `left`/`top`, never centred with `translate(-50%)`, which stood an odd-width window half a pixel
 * off the grid and smeared every icon in it.
 *
 * On a touch screen it is a full-screen sheet instead (`.e1681-sheet`): no width of its own, the header put and the
 * body scrolling, laid out at the provider's `sheetScale`. A press inside never reaches the world under it.
 */
export function Panel({ title, onClose, children, width, at, footer, className, style, titleText }: PanelProps) {
  const cx = useCx();
  const ui = useUi();
  const ref = useRef<HTMLDivElement>(null);
  useFitToViewport(ref, { enabled: !ui.touch, ...(width !== undefined ? { width } : {}), ...(at ? { at } : {}) });
  const name = titleText ?? (typeof title === 'string' ? title : '');
  const header = (
    <div className={cx('e1681-panel-header')}>
      <h3 className={cx('e1681-panel-title')}>{title}</h3>
      {onClose && (
        <button type="button" className={cx('e1681-close')} onClick={onClose} title={ui.labels.closeHint} aria-label={fillLabel(ui.labels.close, name).trim()}>
          <Glyph id="close" />
        </button>
      )}
    </div>
  );
  const classes = ['e1681-panel', 'e1681-frame', ui.touch ? 'e1681-sheet' : '', className ?? ''].filter(Boolean).join(' ');
  const own: CSSProperties = ui.touch ? { ...sheetScaleStyle(ui.sheetScale) } : { width };
  return (
    <div ref={ref} className={cx(classes)} style={{ ...own, ...style }} role="dialog" aria-label={name || undefined} onPointerDown={(e) => e.stopPropagation()}>
      {header}
      <div className={cx(`e1681-panel-body ${SCROLL_CLASS}`)}>{children}</div>
      {footer !== undefined && <div className={cx('e1681-panel-footer')}>{footer}</div>}
    </div>
  );
}
