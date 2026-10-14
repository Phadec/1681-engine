import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SCROLL_CLASS, useFitToViewport } from './useFitToViewport';
import { useUi } from './UiProvider';

export interface ModalProps {
  /** Esc, or a press on the backdrop. */
  onCancel: () => void;
  /** Enter (a text field's own Enter included). */
  onConfirm?: () => void;
  /** The box's preferred width, px. */
  width?: number;
  role?: 'dialog' | 'alertdialog';
  label?: string;
  className?: string;
  children: ReactNode;
  /** Under the scrolling body, never scrolled away: the dialog's buttons. */
  actions?: ReactNode;
}

/**
 * A dialog box over a backdrop, fitted into the viewport like a window (`fitToViewport`, centred in whole pixels) and
 * portalled to the `UiProvider`'s `portal`. Esc and Enter are caught on the window in the capture phase, so they do
 * not also close the window underneath or reach the game's keys.
 */
export function Modal({ onCancel, onConfirm, width, role = 'dialog', label, className, children, actions }: ModalProps) {
  const ui = useUi();
  const ref = useRef<HTMLDivElement>(null);
  useFitToViewport(ref, { enabled: true, ...(width !== undefined ? { width } : {}) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter' && onConfirm) onConfirm();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel, onConfirm]);

  const target = ui.portal();
  const box = (
    <div className="e1681-backdrop" onPointerDown={(e) => e.stopPropagation()} onClick={onCancel}>
      <div
        ref={ref}
        className={`e1681-dialog e1681-frame${className ? ` ${className}` : ''}`}
        role={role}
        aria-modal="true"
        aria-label={label}
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`e1681-dialog-body ${SCROLL_CLASS}`}>{children}</div>
        {actions !== undefined && <div className="e1681-dialog-actions">{actions}</div>}
      </div>
    </div>
  );
  return target ? createPortal(box, target) : box;
}
