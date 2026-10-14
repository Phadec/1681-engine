import { useCallback, useEffect, useState } from 'react';
import { answerConfirm, confirmStore, parseQuantity, type ConfirmQuestion } from './confirmStore';
import { Glyph } from './Glyph';
import { Modal } from './Modal';
import { Slider } from './Slider';
import { useStore } from './useStore';
import { useUi, useCx } from './UiProvider';

const selectPending = (s: { pending: ConfirmQuestion | null }) => s.pending;

/**
 * The open `askConfirm` / `askQuantity` question, if any: mounted once at the UI's root. Enter confirms, Esc or a
 * press outside cancels. A quantity is asked with a slider, − and + and a field for an exact number (a slider over 99
 * cannot land on 37 with a thumb).
 */
export function ConfirmDialog({ width = 360 }: { width?: number }) {
  const cx = useCx();
  const ui = useUi();
  const pending = useStore(confirmStore, selectPending);
  const [qty, setQty] = useState(1);
  useEffect(() => setQty(Math.max(1, pending?.max ?? 1)), [pending]);
  const many = (pending?.max ?? 0) > 1;
  const cancel = useCallback(() => answerConfirm(0), []);
  const confirm = useCallback(() => answerConfirm(many ? qty : 1), [many, qty]);
  if (!pending) return null;
  const max = pending.max;
  return (
    <Modal
      role="alertdialog"
      width={width}
      onCancel={cancel}
      onConfirm={confirm}
      className={cx('e1681-confirm')}
      actions={
        <>
          <button type="button" className={cx('e1681-button ghost')} onClick={cancel}>
            {pending.cancel ?? ui.labels.cancel}
          </button>
          <button type="button" className={cx('e1681-button')} autoFocus={!ui.touch} onClick={confirm}>
            {pending.ok ?? ui.labels.ok}
          </button>
        </>
      }
    >
      <div className={cx('e1681-confirm-text')}>{pending.text}</div>
      {many && (
        <div className={cx('e1681-confirm-qty')}>
          <button type="button" className={cx('e1681-button ghost small')} aria-label="-1" onClick={() => setQty(Math.max(1, qty - 1))}>
            <Glyph id="minus" />
          </button>
          <Slider value={qty} min={1} max={max} step={1} format={(v) => `x${v}`} label={ui.labels.quantity} onChange={setQty} />
          <button type="button" className={cx('e1681-button ghost small')} aria-label="+1" onClick={() => setQty(Math.min(max, qty + 1))}>
            <Glyph id="plus" />
          </button>
          <input
            className={cx('e1681-input e1681-confirm-qty-input')}
            inputMode="numeric"
            aria-label={ui.labels.quantity}
            value={qty}
            onChange={(e) => setQty(parseQuantity(e.target.value, max))}
            onFocus={(e) => e.target.select()}
          />
        </div>
      )}
    </Modal>
  );
}
